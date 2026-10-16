import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { type StorageAdapter, createAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { backfillTakenAt } from './taken-at-backfill'

const FAMILY_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'

let db: TestDb
let dir: string
let storage: StorageAdapter
const logger = { info: vi.fn(), warn: vi.fn() }
// 실제 순간은 이 프로세스의 벽시계로 옮긴다 — 운영 컨테이너처럼 TZ=Asia/Seoul 로 돈다.
let savedTz: string | undefined

beforeAll(async () => {
  db = await startTestDb()
}, 180_000)
afterAll(async () => {
  await db.stop()
})

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-taken-at-'))
  storage = createAdapter({ mode: 'local', path: dir })
  await db.prisma.asset.deleteMany({ where: { familyId: FAMILY_ID } })
  await db.prisma.$executeRawUnsafe(`
    INSERT INTO public.users (id, email, password_hash, display_name, created_at, updated_at)
    VALUES ('${USER_ID}', 'backfill@example.com', 'x', 'T', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `)
  await db.prisma.$executeRawUnsafe(`
    INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
    VALUES ('${FAMILY_ID}', 'F', 'backfill-fam', '${USER_ID}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `)
  savedTz = process.env.TZ
  process.env.TZ = 'Asia/Seoul'
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (savedTz === undefined) delete process.env.TZ
  else process.env.TZ = savedTz
})

async function jpegTakenAt(dateTimeOriginal: string): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } })
    .withExif({ IFD2: { DateTimeOriginal: dateTimeOriginal } })
    .jpeg()
    .toBuffer()
}

type Seed = {
  kind?: 'image' | 'video'
  source: 'exif' | 'filename' | 'filemtime' | 'manual' | 'uploaded'
  takenAt: string
  uploadedAt?: string
  fileModifiedAt?: string
  exifRaw?: Record<string, string>
  original?: Buffer
  duplicateOf?: string
}

async function seed(s: Seed): Promise<string> {
  const id = randomUUID()
  const originalKey = `families/${FAMILY_ID}/assets/${id}/original`
  if (s.original) await storage.writeBuffer(originalKey, s.original, 'image/jpeg')
  await db.prisma.asset.create({
    data: {
      id,
      familyId: FAMILY_ID,
      uploadedByUserId: USER_ID,
      kind: s.kind ?? 'image',
      originalKey,
      originalFilename: 'IMG_1234.JPG',
      mimeType: s.kind === 'video' ? 'video/mp4' : 'image/jpeg',
      sizeBytes: 1n,
      sha256: randomBytes(32).toString('hex'),
      takenAt: new Date(s.takenAt),
      takenAtSource: s.source,
      status: 'ready',
      uploadedAt: new Date(s.uploadedAt ?? s.takenAt),
      ...(s.fileModifiedAt ? { fileModifiedAt: new Date(s.fileModifiedAt) } : {}),
      ...(s.exifRaw ? { exifRaw: s.exifRaw } : {}),
      ...(s.duplicateOf ? { duplicateOf: s.duplicateOf } : {}),
    },
  })
  return id
}

async function stored(id: string) {
  const a = await db.prisma.asset.findFirstOrThrow({ where: { id, familyId: FAMILY_ID } })
  return {
    takenAt: a.takenAt.toISOString(),
    source: a.takenAtSource,
    fileModifiedAt: a.fileModifiedAt?.toISOString() ?? null,
  }
}

function run(dryRun = false, store: StorageAdapter = storage) {
  return backfillTakenAt({ prisma: db.prisma, storage: store, dryRun, logger })
}

describe('backfillTakenAt', () => {
  it('EXIF 사진: 실제 순간으로 저장된 값을 EXIF 벽시계로 되돌리고, 다시 돌려도 그대로다', async () => {
    // 2026-10-12 07:44:52 KST 에 찍었는데 TZ=Asia/Seoul 워커가 전날 22:44:52Z 로 저장했다.
    const skewed = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    // TZ 가 없던 시절에 처리돼 이미 맞는 행.
    const correct = await seed({
      source: 'exif',
      takenAt: '2026-05-30T10:00:00Z',
      original: await jpegTakenAt('2026:05:30 10:00:00'),
    })

    const first = await run()
    expect(await stored(skewed)).toMatchObject({
      takenAt: '2026-10-12T07:44:52.000Z',
      source: 'exif',
    })
    expect(await stored(correct)).toMatchObject({
      takenAt: '2026-05-30T10:00:00.000Z',
      source: 'exif',
    })
    expect(first.exif).toMatchObject({ checked: 2, fixed: 1 })

    const second = await run()
    expect(second.exif).toMatchObject({ checked: 2, fixed: 0 })
    expect(await stored(skewed)).toMatchObject({ takenAt: '2026-10-12T07:44:52.000Z' })
  })

  it('원본을 못 읽거나 EXIF 날짜가 없으면 손대지 않고 남긴다', async () => {
    const missing = await seed({ source: 'exif', takenAt: '2026-10-11T22:44:52Z' })
    const dateless = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
        .jpeg()
        .toBuffer(),
    })

    const report = await run()

    expect(await stored(missing)).toMatchObject({ takenAt: '2026-10-11T22:44:52.000Z' })
    expect(await stored(dateless)).toMatchObject({ takenAt: '2026-10-11T22:44:52.000Z' })
    expect(report.exif).toMatchObject({ checked: 2, fixed: 0, unreadable: 1, noDate: 1 })
  })

  it('날짜 칸을 눌렀다 떼기만 해서 수동이 된 행은 EXIF 로 되돌리고, 직접 고친 행은 둔다', async () => {
    // 편집기는 분 단위로 잘라 저장했다 — 그때 값은 실제 순간 22:44:52Z.
    const accidental = await seed({
      source: 'manual',
      takenAt: '2026-10-11T22:44:00Z',
      exifRaw: { DateTimeOriginal: '2026-10-11T22:44:52.000Z' },
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const deliberate = await seed({
      source: 'manual',
      takenAt: '2026-10-20T12:00:00Z',
      exifRaw: { DateTimeOriginal: '2026-10-11T22:44:52.000Z' },
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })

    const report = await run()

    expect(await stored(accidental)).toMatchObject({
      takenAt: '2026-10-12T07:44:52.000Z',
      source: 'exif',
    })
    expect(await stored(deliberate)).toMatchObject({
      takenAt: '2026-10-20T12:00:00.000Z',
      source: 'manual',
    })
    expect(report.manual).toMatchObject({ restored: 1 })
  })

  it('업로드 시각 행은 uploaded_at 의 벽시계로 — 밀리초까지, 몇 번을 돌려도 같다', async () => {
    // 2026-10-12 07:44:30 KST 에 올렸다.
    const uploaded = await seed({
      source: 'uploaded',
      takenAt: '2026-10-11T22:44:30.123Z',
      uploadedAt: '2026-10-11T22:44:30.123Z',
    })
    // 그 값이 눌렀다 떼기로 분 단위 수동이 된 행.
    const accidental = await seed({
      source: 'manual',
      takenAt: '2026-10-11T22:44:00Z',
      uploadedAt: '2026-10-11T22:44:30.123Z',
    })

    const first = await run()
    const second = await run()

    expect(await stored(uploaded)).toMatchObject({
      takenAt: '2026-10-12T07:44:30.123Z',
      source: 'uploaded',
    })
    expect(await stored(accidental)).toMatchObject({
      takenAt: '2026-10-12T07:44:30.123Z',
      source: 'uploaded',
    })
    expect(first.uploaded).toEqual({ fixed: 2 })
    expect(second.uploaded).toEqual({ fixed: 0 })
  })

  it('파일 수정시각: 예전 행은 taken_at 의 실제 순간을 남기고 옮기며, 몇 번을 돌려도 같다', async () => {
    // 2026-10 전 init 이 실제 순간을 taken_at 에 바로 넣은 행.
    const legacy = await seed({ source: 'filemtime', takenAt: '2026-10-11T22:44:00.500Z' })
    // 고친 init 이 실제 순간과 벽시계를 함께 남긴 행.
    const current = await seed({
      source: 'filemtime',
      takenAt: '2026-10-12T07:44:00Z',
      fileModifiedAt: '2026-10-11T22:44:00Z',
    })

    const first = await run()
    expect(first.filemtime).toEqual({ fixed: 1 })
    expect(await stored(legacy)).toEqual({
      takenAt: '2026-10-12T07:44:00.500Z',
      source: 'filemtime',
      fileModifiedAt: '2026-10-11T22:44:00.500Z',
    })
    expect(await stored(current)).toEqual({
      takenAt: '2026-10-12T07:44:00.000Z',
      source: 'filemtime',
      fileModifiedAt: '2026-10-11T22:44:00.000Z',
    })

    const second = await run()
    expect(second.filemtime).toEqual({ fixed: 0 })
    expect(await stored(legacy)).toMatchObject({ takenAt: '2026-10-12T07:44:00.500Z' })
  })

  it('업그레이드 전 백업을 복구해 예전 값이 돌아와도 다시 돌리면 고친다', async () => {
    const legacy = await seed({ source: 'filemtime', takenAt: '2026-10-11T22:44:00Z' })
    await run()
    // 복구: 덤프에는 file_modified_at 이 없어 비고, taken_at 은 실제 순간으로 돌아온다.
    await db.prisma.asset.update({
      where: { id: legacy, familyId: FAMILY_ID },
      data: { takenAt: new Date('2026-10-11T22:44:00Z'), fileModifiedAt: null },
    })

    await run()

    expect(await stored(legacy)).toMatchObject({ takenAt: '2026-10-12T07:44:00.000Z' })
  })

  it('중복 별칭은 원본이 고쳐진 값을 따라간다', async () => {
    const canonical = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const alias = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      duplicateOf: canonical,
    })

    const report = await run()

    expect(await stored(alias)).toMatchObject({
      takenAt: '2026-10-12T07:44:52.000Z',
      source: 'exif',
    })
    expect(report.aliases).toEqual({ fixed: 1 })
  })

  it('별칭 자체를 직접 고쳤으면 원본을 따라가지 않는다', async () => {
    const canonical = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const edited = await seed({
      source: 'manual',
      takenAt: '2026-09-01T09:00:00Z',
      duplicateOf: canonical,
    })

    await run()

    expect(await stored(edited)).toMatchObject({
      takenAt: '2026-09-01T09:00:00.000Z',
      source: 'manual',
    })
  })

  it('파일 수정시각 별칭은 원래 순간까지 따라가서, 나중에 원본이 영구삭제돼도 다시 옮겨지지 않는다', async () => {
    const canonical = await seed({ source: 'filemtime', takenAt: '2026-10-11T22:44:00Z' })
    const alias = await seed({
      source: 'filemtime',
      takenAt: '2026-10-11T22:44:00Z',
      duplicateOf: canonical,
    })

    await run()
    expect(await stored(alias)).toEqual({
      takenAt: '2026-10-12T07:44:00.000Z',
      source: 'filemtime',
      fileModifiedAt: '2026-10-11T22:44:00.000Z',
    })

    // 휴지통 비우기는 원본 행만 지우고 공유 바이트·별칭은 남긴다.
    await db.prisma.asset.delete({ where: { id: canonical } })
    await run()

    expect(await stored(alias)).toMatchObject({ takenAt: '2026-10-12T07:44:00.000Z' })
  })

  it('원본이 사라진 업로드 시각 별칭은 자기 업로드 시각으로 다시 세지 않는다 — 원본의 날짜를 물려받은 것이다', async () => {
    // 3월에 올린 사진을 9월에 스토리에 다시 올려 별칭이 됐고, 원본은 영구삭제됐다.
    const alias = await seed({
      source: 'uploaded',
      takenAt: '2026-03-01T00:00:00Z',
      uploadedAt: '2026-09-01T03:00:00Z',
      duplicateOf: randomUUID(),
    })

    await run()

    expect(await stored(alias)).toMatchObject({ takenAt: '2026-03-01T00:00:00.000Z' })
  })

  it('날짜 없는 메타데이터(PNG 등)가 있어도 업로드 시각을 눌렀다 떼기로 저장한 행은 되돌린다', async () => {
    const png = await seed({
      source: 'manual',
      takenAt: '2026-06-15T04:22:00Z',
      uploadedAt: '2026-06-15T04:22:55.493Z',
      exifRaw: { ImageWidth: '1080' },
    })

    await run()

    expect(await stored(png)).toMatchObject({
      takenAt: '2026-06-15T13:22:55.493Z',
      source: 'uploaded',
    })
  })

  it('원본의 수동 날짜를 물려받은 별칭은 원본이 되돌려지면 따라간다', async () => {
    // 원본이 눌렀다 떼기로 수동이 된 뒤 같은 사진이 다시 올라와 그 값을 물려받았다.
    const canonical = await seed({
      source: 'manual',
      takenAt: '2026-10-11T22:44:00Z',
      exifRaw: { DateTimeOriginal: '2026-10-11T22:44:52.000Z' },
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const inherited = await seed({
      source: 'manual',
      takenAt: '2026-10-11T22:44:00Z',
      duplicateOf: canonical,
    })

    await run()

    expect(await stored(inherited)).toMatchObject({
      takenAt: '2026-10-12T07:44:52.000Z',
      source: 'exif',
    })
  })

  it('원본 행이 영구삭제된 별칭은 스스로 고친다', async () => {
    const orphan = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      duplicateOf: randomUUID(),
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })

    await run()

    expect(await stored(orphan)).toMatchObject({
      takenAt: '2026-10-12T07:44:52.000Z',
      source: 'exif',
    })
  })

  it('영상 메타데이터·파일명 출처는 이미 벽시계라 두고, 업로드 시각뿐인 영상은 옮긴다', async () => {
    const video = await seed({ kind: 'video', source: 'exif', takenAt: '2026-10-12T07:44:52Z' })
    const named = await seed({ source: 'filename', takenAt: '2026-10-12T07:44:52Z' })
    const bareVideo = await seed({
      kind: 'video',
      source: 'uploaded',
      takenAt: '2026-10-11T22:44:00Z',
    })

    await run()

    expect(await stored(video)).toMatchObject({ takenAt: '2026-10-12T07:44:52.000Z' })
    expect(await stored(named)).toMatchObject({ takenAt: '2026-10-12T07:44:52.000Z' })
    expect(await stored(bareVideo)).toMatchObject({ takenAt: '2026-10-12T07:44:00.000Z' })
  })

  it('도는 사이에 사용자가 날짜를 고치면 그 값을 덮어쓰지 않는다', async () => {
    const photo = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const editingStorage: StorageAdapter = {
      ...storage,
      read: async (key) => {
        // 원본을 읽는 사이에 사용자가 날짜를 고친다.
        await db.prisma.asset.update({
          where: { id: photo, familyId: FAMILY_ID },
          data: { takenAt: new Date('2001-05-03T12:00:00Z'), takenAtSource: 'manual' },
        })
        return storage.read(key)
      },
    }

    const report = await run(false, editingStorage)

    expect(await stored(photo)).toMatchObject({
      takenAt: '2001-05-03T12:00:00.000Z',
      source: 'manual',
    })
    expect(report.exif.fixed).toBe(0)
  })

  it('dry-run 은 무엇을 고칠지만 세고 아무것도 쓰지 않는다', async () => {
    const skewed = await seed({
      source: 'exif',
      takenAt: '2026-10-11T22:44:52Z',
      original: await jpegTakenAt('2026:10:12 07:44:52'),
    })
    const uploaded = await seed({ source: 'uploaded', takenAt: '2026-10-11T22:44:30Z' })
    const mtime = await seed({ source: 'filemtime', takenAt: '2026-10-11T22:44:00Z' })

    const report = await run(true)

    expect(report).toMatchObject({
      exif: { fixed: 1 },
      uploaded: { fixed: 1 },
      filemtime: { fixed: 1 },
    })
    expect(await stored(skewed)).toMatchObject({ takenAt: '2026-10-11T22:44:52.000Z' })
    expect(await stored(uploaded)).toMatchObject({ takenAt: '2026-10-11T22:44:30.000Z' })
    expect(await stored(mtime)).toEqual({
      takenAt: '2026-10-11T22:44:00.000Z',
      source: 'filemtime',
      fileModifiedAt: null,
    })
  })
})
