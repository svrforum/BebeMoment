import { encryptSecret } from '@/lib/crypto'
import { setSetting } from '@/server/settings/set'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  downloadBackupFromRemote,
  loadRemoteConfig,
  parseRemoteManifest,
  redactSecrets,
} from './remote'

// 버킷의 JSON 은 신뢰할 수 없다 — id 가 그대로 path.join(backupDir, id + '.tar.zst') 의 파일명이
// 되므로 `../../x` 같은 id 는 백업 디렉터리 밖에 쓴다. parentId 도 체인을 따라 같은 경로로 간다.
describe('parseRemoteManifest', () => {
  const good = {
    version: 1,
    id: 'bebe-backup-20260830-010203-full-0a1b2c',
    createdAt: '2026-08-30T01:02:03.000Z',
    type: 'full',
    parentId: null,
    schemaMigrations: [],
    includesSecret: false,
    dataFileCount: 0,
    dataBytes: 0,
  }

  it('accepts a well-formed manifest', () => {
    expect(parseRemoteManifest(JSON.stringify(good))?.id).toBe(good.id)
    const incr = { ...good, type: 'incr', parentId: good.id }
    expect(parseRemoteManifest(JSON.stringify(incr))?.parentId).toBe(good.id)
  })

  it('rejects an id that is not a backup id (path traversal)', () => {
    expect(parseRemoteManifest(JSON.stringify({ ...good, id: '../../x' }))).toBeNull()
    expect(parseRemoteManifest(JSON.stringify({ ...good, id: '/etc/passwd' }))).toBeNull()
    expect(parseRemoteManifest(JSON.stringify({ ...good, id: 42 }))).toBeNull()
  })

  it('rejects a non-null parentId that is not a backup id', () => {
    expect(parseRemoteManifest(JSON.stringify({ ...good, parentId: '../../x' }))).toBeNull()
    expect(parseRemoteManifest(JSON.stringify({ ...good, parentId: 7 }))).toBeNull()
  })

  it('rejects other versions and non-JSON bodies', () => {
    expect(parseRemoteManifest(JSON.stringify({ ...good, version: 2 }))).toBeNull()
    expect(parseRemoteManifest('not json')).toBeNull()
  })
})

describe('downloadBackupFromRemote', () => {
  it('refuses an invalid id before touching the bucket or the disk', async () => {
    const cfg = {
      endpoint: '',
      region: 'us-east-1',
      bucket: 'b',
      prefix: '',
      accessKeyId: 'k',
      secretAccessKey: 's',
    }
    await expect(
      downloadBackupFromRemote({ cfg, backupDir: '/nonexistent', id: '../../x' }),
    ).rejects.toThrow('backup.invalidId')
  })
})

describe('redactSecrets', () => {
  it('masks AWS access key ids', () => {
    expect(redactSecrets('auth failed for AKIAIOSFODNN7EXAMPLE on bucket')).not.toContain(
      'AKIAIOSFODNN7EXAMPLE',
    )
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('***')
  })

  it('masks postgres URL passwords', () => {
    const out = redactSecrets('connect to postgres://bebe:s3cr3tpw@db:5432/bebe failed')
    expect(out).not.toContain('s3cr3tpw')
    expect(out).toContain('postgres://bebe:***@db:5432/bebe')
  })

  it('masks supplied literal secrets (accessKeyId/secret/endpoint)', () => {
    const out = redactSecrets('PUT https://minio.local/bucket key=MYKEYID denied', [
      'MYKEYID',
      'topsecret',
      'https://minio.local',
    ])
    expect(out).not.toContain('MYKEYID')
    expect(out).not.toContain('https://minio.local')
  })

  it('keeps non-sensitive diagnostic text', () => {
    expect(redactSecrets('NoSuchBucket: bucket does not exist')).toContain('NoSuchBucket')
  })
})

describe('loadRemoteConfig — 꺼짐과 고장을 구분한다', () => {
  let db: FullTestDb
  beforeAll(async () => {
    db = await startFullTestDb()
  }, 120_000)
  afterAll(async () => {
    await db.stop()
  })
  beforeEach(async () => {
    await db.prismaPublic.appSetting.deleteMany()
  })

  const KEY = 'a'.repeat(64)

  async function set(vals: Record<string, unknown>) {
    for (const [k, v] of Object.entries(vals)) await setSetting(k, v, null, db.prismaPublic)
  }

  it('꺼져 있으면 null — 미러링을 건너뛰는 게 맞다', async () => {
    await set({ 'backup.remote.enabled': false })
    expect(await loadRemoteConfig(db.prismaPublic, KEY)).toBeNull()
  })

  // 여기가 핵심이었다: 예전엔 이것도 null 이라 runBackup 이 조용히 건너뛰고 catch 도 안 타
  // last_error 가 비었다 — 매일 "백업 성공"이 찍히는데 아무것도 안 올라갔다.
  it('켜져 있는데 버킷이 비면 던진다 — 조용히 건너뛰지 않는다', async () => {
    await set({
      'backup.remote.enabled': true,
      'backup.remote.bucket': '',
      'backup.remote.access_key': 'AKIA_TEST_KEY_ID',
      'backup.remote.secret_key': await encryptSecret('s', KEY),
    })
    await expect(loadRemoteConfig(db.prismaPublic, KEY)).rejects.toThrow()
  })

  it('시크릿을 복호화할 수 없으면 던진다 — SECRET_KEY 회전 시나리오', async () => {
    await set({
      'backup.remote.enabled': true,
      'backup.remote.bucket': 'b',
      'backup.remote.access_key': 'AKIA_TEST_KEY_ID',
      'backup.remote.secret_key': await encryptSecret('s', KEY),
    })
    // 다른 키로 읽으면 AES-GCM 인증이 깨진다.
    await expect(loadRemoteConfig(db.prismaPublic, 'b'.repeat(64))).rejects.toThrow()
  })

  it('제대로 설정돼 있으면 config 를 돌려준다', async () => {
    await set({
      'backup.remote.enabled': true,
      'backup.remote.bucket': 'my-bucket',
      'backup.remote.access_key': 'AKIA_TEST_KEY_ID',
      'backup.remote.secret_key': await encryptSecret('super-secret', KEY),
      'backup.remote.endpoint': 'http://minio.local:9000',
    })
    const cfg = await loadRemoteConfig(db.prismaPublic, KEY)
    expect(cfg).toMatchObject({
      bucket: 'my-bucket',
      accessKeyId: 'AKIA_TEST_KEY_ID',
      secretAccessKey: 'super-secret',
      endpoint: 'http://minio.local:9000',
    })
  })
})
