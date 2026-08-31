import { encryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { type RemoteConfig, loadRemoteConfig, redactSecrets, testRemote } from '@/server/backup/remote'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const get = (k: string, def = '') => getSetting(k, z.string(), def, prismaPublic)
  const [enabled, endpoint, region, bucket, prefix, accessKey, enc, lastError] = await Promise.all([
    getSetting('backup.remote.enabled', z.boolean(), false, prismaPublic),
    get('backup.remote.endpoint'),
    get('backup.remote.region', 'us-east-1'),
    get('backup.remote.bucket'),
    get('backup.remote.prefix'),
    get('backup.remote.access_key'),
    get('backup.remote.secret_key'),
    getSetting('backup.remote.last_error', z.string().nullable(), null, prismaPublic),
  ])
  // ⚠️ "암호문이 있다"와 "쓸 수 있다"는 다르다. SECRET_KEY 가 바뀌면 암호문은 그대로인데
  // 복호화가 깨져 원격 백업이 조용히 멈춘다 — 예전엔 화면이 정상이라고 안심시켰다.
  // 실제로 config 를 만들어 보고 그 결과를 알려준다.
  let usable = false
  let configError: string | null = null
  if (enabled) {
    try {
      usable = (await loadRemoteConfig(prismaPublic, process.env.SECRET_KEY ?? '')) !== null
    } catch (e) {
      configError = redactSecrets((e as Error).message).slice(0, 200)
    }
  }
  return NextResponse.json({
    enabled,
    endpoint,
    region,
    bucket,
    prefix,
    accessKey,
    // 시크릿은 절대 반환하지 않음 — 설정 여부만(§17#7/#23).
    secretConfigured: enc.length > 0,
    usable,
    configError,
    lastError,
  })
}

const SaveSchema = z.object({
  enabled: z.boolean().optional(),
  endpoint: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  prefix: z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(), // 제공 시에만 갱신(빈 문자열이면 유지)
  test: z.boolean().optional(),
})

async function effectiveConfig(
  body: z.infer<typeof SaveSchema>,
  secretEnvKey: string,
): Promise<RemoteConfig | null> {
  // 저장된 설정을 베이스로, 요청에 온 필드로 덮어쓴 임시 config(테스트용).
  // 저장값이 불완전하거나 복호화 불가면 loadRemoteConfig 가 던진다 — 하필 그때가 연결
  // 테스트가 가장 필요한 순간이므로, 빈 베이스로 떨어뜨려 폼 값만으로 시험하게 둔다.
  const stored = await loadRemoteConfig(prismaPublic, secretEnvKey).catch(() => null)
  const base: RemoteConfig = stored ?? {
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    prefix: '',
    accessKeyId: '',
    secretAccessKey: '',
  }
  return {
    endpoint: body.endpoint ?? base.endpoint,
    region: body.region || base.region || 'us-east-1',
    bucket: body.bucket ?? base.bucket,
    prefix: body.prefix ?? base.prefix,
    accessKeyId: body.accessKey ?? base.accessKeyId,
    secretAccessKey:
      body.secretKey && body.secretKey.length > 0 ? body.secretKey : base.secretAccessKey,
  }
}

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const secretEnvKey = process.env.SECRET_KEY ?? ''
  try {
    const body = SaveSchema.parse(await req.json())

    if (body.test) {
      const cfg = await effectiveConfig(body, secretEnvKey)
      if (!cfg || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
        return errorJsonKey('backup.remoteMissingCreds', 400)
      }
      await testRemote(cfg)
      return NextResponse.json({ ok: true, tested: true })
    }

    if (body.enabled !== undefined)
      await setSetting('backup.remote.enabled', body.enabled, ctx.user.id, prismaPublic)
    if (body.endpoint !== undefined)
      await setSetting('backup.remote.endpoint', body.endpoint, ctx.user.id, prismaPublic)
    if (body.region !== undefined)
      await setSetting('backup.remote.region', body.region, ctx.user.id, prismaPublic)
    if (body.bucket !== undefined)
      await setSetting('backup.remote.bucket', body.bucket, ctx.user.id, prismaPublic)
    if (body.prefix !== undefined)
      await setSetting('backup.remote.prefix', body.prefix, ctx.user.id, prismaPublic)
    if (body.accessKey !== undefined)
      await setSetting('backup.remote.access_key', body.accessKey, ctx.user.id, prismaPublic)
    if (body.secretKey !== undefined && body.secretKey.length > 0) {
      const enc = await encryptSecret(body.secretKey, secretEnvKey)
      await setSetting('backup.remote.secret_key', enc, ctx.user.id, prismaPublic)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
