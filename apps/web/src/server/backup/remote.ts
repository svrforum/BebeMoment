import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { decryptSecret } from '@/lib/crypto'
import { getSetting } from '@/server/settings/get'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { bundleName, manifestName } from './manifest'

export type RemoteConfig = {
  endpoint: string // S3 호환(MinIO/B2). 비우면 AWS S3
  region: string
  bucket: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * 에러 메시지를 설정(`backup.*.last_error`)에 저장하기 전에 자격/시크릿 흔적을 가린다.
 * 이 값은 관리자 API(GET)로 노출되므로, S3 SDK·pg 에러에 섞여 들어올 수 있는 access
 * key id·DB URL 비밀번호·전달된 시크릿 리터럴을 마스킹한다. 진단용 나머지 텍스트는 유지.
 */
export function redactSecrets(msg: string, extra: string[] = []): string {
  let out = msg
  for (const lit of extra) {
    if (lit && lit.length >= 4) out = out.split(lit).join('***')
  }
  out = out.replace(/A[KS]IA[0-9A-Z]{16}/g, '***') // AWS access key id
  out = out.replace(/(postgres(?:ql)?:\/\/[^:@/\s]+:)[^@\s]+@/gi, '$1***@') // DB URL 비번
  return out
}

function makeClient(cfg: RemoteConfig): S3Client {
  return new S3Client({
    region: cfg.region || 'us-east-1',
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
}

function objectKey(cfg: RemoteConfig, name: string): string {
  const p = cfg.prefix.replace(/^\/+|\/+$/g, '')
  return p ? `${p}/${name}` : name
}

/** 백업 설정(원격)을 읽어 복호화한 config 를 만든다. 비활성/미설정이면 null. */
export async function loadRemoteConfig(
  prisma: PrismaClient,
  secretKey: string,
): Promise<RemoteConfig | null> {
  const enabled = await getSetting('backup.remote.enabled', z.boolean(), false, prisma)
  if (!enabled) return null
  const bucket = await getSetting('backup.remote.bucket', z.string(), '', prisma)
  const accessKeyId = await getSetting('backup.remote.access_key', z.string(), '', prisma)
  const enc = await getSetting('backup.remote.secret_key', z.string(), '', prisma)
  if (!bucket || !accessKeyId || !enc || !secretKey) return null
  let secretAccessKey: string
  try {
    secretAccessKey = await decryptSecret(enc, secretKey)
  } catch {
    return null
  }
  return {
    endpoint: await getSetting('backup.remote.endpoint', z.string(), '', prisma),
    region: await getSetting('backup.remote.region', z.string(), 'us-east-1', prisma),
    bucket,
    prefix: await getSetting('backup.remote.prefix', z.string(), '', prisma),
    accessKeyId,
    secretAccessKey,
  }
}

/** 번들 + 사이드카 매니페스트를 원격에 올린다(번들은 멀티파트 스트림). */
export async function uploadBackupToRemote(args: {
  cfg: RemoteConfig
  backupDir: string
  id: string
}): Promise<void> {
  const s3 = makeClient(args.cfg)
  try {
    const up = new Upload({
      client: s3,
      params: {
        Bucket: args.cfg.bucket,
        Key: objectKey(args.cfg, bundleName(args.id)),
        Body: createReadStream(path.join(args.backupDir, bundleName(args.id))),
      },
    })
    await up.done()
    await s3.send(
      new PutObjectCommand({
        Bucket: args.cfg.bucket,
        Key: objectKey(args.cfg, manifestName(args.id)),
        Body: await fs.readFile(path.join(args.backupDir, manifestName(args.id))),
      }),
    )
  } finally {
    s3.destroy()
  }
}

/** 자격증명·버킷 검증 — 작은 객체 PUT 후 DELETE. */
export async function testRemote(cfg: RemoteConfig): Promise<void> {
  const s3 = makeClient(cfg)
  const key = objectKey(cfg, '.bebe-backup-test')
  try {
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: 'ok' }))
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } finally {
    s3.destroy()
  }
}
