import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listBackups } from './list'
import { bundleName, manifestName } from './manifest'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bebe-backup-list-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

async function writeBackup(id: string, manifest: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(dir, manifestName(id)), JSON.stringify(manifest))
  await fs.writeFile(path.join(dir, bundleName(id)), 'zz')
}

const GOOD_ID = 'bebe-backup-20260830-010203-full-0a1b2c'
const base = {
  version: 1,
  createdAt: '2026-08-30T01:02:03.000Z',
  type: 'full',
  parentId: null,
  schemaMigrations: [],
  includesSecret: false,
  dataFileCount: 0,
  dataBytes: 0,
}

describe('listBackups', () => {
  it('lists a healthy sidecar + bundle pair', async () => {
    await writeBackup(GOOD_ID, { ...base, id: GOOD_ID })
    expect((await listBackups(dir)).map((b) => b.id)).toEqual([GOOD_ID])
  })

  // 백업 볼륨의 사이드카도 원격과 같은 규칙 — 매니페스트 안의 id/parentId 가 파일명·체인 탐색의
  // 경로가 되므로 백업 id 형식이 아니면 목록에서 뺀다.
  it('skips a sidecar whose id or parentId is not a backup id', async () => {
    await fs.writeFile(
      path.join(dir, manifestName('x')),
      JSON.stringify({ ...base, id: '../../escape' }),
    )
    await writeBackup(GOOD_ID, { ...base, id: GOOD_ID, type: 'incr', parentId: '../../x' })
    expect(await listBackups(dir)).toEqual([])
  })

  it('ignores the .work directory used while a backup is being written', async () => {
    await fs.mkdir(path.join(dir, '.work', GOOD_ID), { recursive: true })
    await writeBackup(GOOD_ID, { ...base, id: GOOD_ID })
    expect((await listBackups(dir)).map((b) => b.id)).toEqual([GOOD_ID])
  })
})
