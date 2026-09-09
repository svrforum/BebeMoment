import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)
const FAMILY_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const LONG_AGO = new Date('2020-01-01T00:00:00Z')

/**
 * 실제 HTTP 로 tus PATCH 를 태워 진행 하트비트를 확인한다 — 이 훅은 tus 서버 옵션에
 * 걸려 있어서 도메인 함수 테스트만으로는 "연결됐는지"를 못 본다. 업로드 경로가 깨지면
 * 전부 깨지므로 여기서 한 번 진짜로 통과시킨다.
 */
describe('PATCH /media/v1/tus/:id', () => {
  let db: TestDb
  let base: string
  let close: () => Promise<void>

  beforeAll(async () => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = TOKEN
    process.env.STORAGE_MODE = 'local'
    process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-tus-'))
    db = await startTestDb()
    process.env.DATABASE_URL = db.url
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES ('${USER_ID}', 'p@b.com', 'x', 'U', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`)
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('${FAMILY_ID}', 'F', 'f', '${USER_ID}', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`)
    const { buildApp } = await import('@/server')
    const app = buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    base = `http://127.0.0.1:${addr.port}`
    close = () => app.close()
  }, 180_000)

  afterAll(async () => {
    await close()
    await db.stop()
  })

  test('부분 청크가 오프셋을 올리고 자산의 updated_at 을 민다', async () => {
    const { initAsset } = await import('@/domain/upload/init')
    const init = await initAsset(
      {
        familyId: FAMILY_ID,
        uploaderId: USER_ID,
        mime: 'video/mp4',
        sizeBytes: 10,
        originalName: 'clip.mp4',
      },
      db.prisma,
      base,
    )
    await db.prisma.$executeRawUnsafe(
      'UPDATE media.assets SET updated_at = $1 WHERE id = $2::uuid',
      LONG_AGO,
      init.assetId,
    )

    const res = await fetch(`${base}/media/v1/tus/${init.assetId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${init.uploadToken}`,
        'tus-resumable': '1.0.0',
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      },
      body: new Uint8Array([1, 2, 3, 4]),
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('upload-offset')).toBe('4')

    const row = await db.prisma.asset.findUniqueOrThrow({
      where: { id: init.assetId },
      select: { updatedAt: true, status: true },
    })
    // 아직 완료되지 않았으므로 uploading 그대로 — 그러나 진행 흔적은 남는다.
    expect(row.status).toBe('uploading')
    expect(row.updatedAt.getTime()).toBeGreaterThan(LONG_AGO.getTime())
  })

  test('토큰 없는 PATCH 는 거부한다', async () => {
    const res = await fetch(`${base}/media/v1/tus/${FAMILY_ID}`, {
      method: 'PATCH',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      },
      body: new Uint8Array([1]),
    })
    expect(res.status).toBe(401)
  })
})
