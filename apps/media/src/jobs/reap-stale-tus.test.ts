import fs from 'node:fs'
import { utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reapStaleTusTmp } from './reap-stale-tus'

describe('reapStaleTusTmp', () => {
  let storageDir: string
  let tusDir: string
  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-tustmp-'))
    tusDir = path.join(storageDir, 'tus-tmp')
    fs.mkdirSync(tusDir, { recursive: true })
  })
  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true })
  })

  async function makeFile(name: string, ageMs: number): Promise<string> {
    const p = path.join(tusDir, name)
    await writeFile(p, 'x')
    const t = new Date(Date.now() - ageMs)
    await utimes(p, t, t)
    return p
  }

  it('deletes tus-tmp entries older than the cutoff and keeps fresh ones', async () => {
    const oldUpload = await makeFile('old-asset', 2 * 60 * 60 * 1000)
    const oldSidecar = await makeFile('old-asset.json', 2 * 60 * 60 * 1000)
    const fresh = await makeFile('fresh-asset', 60 * 1000)

    const n = await reapStaleTusTmp(storageDir, 60 * 60 * 1000)

    expect(n).toBe(2)
    expect(fs.existsSync(oldUpload)).toBe(false)
    expect(fs.existsSync(oldSidecar)).toBe(false)
    expect(fs.existsSync(fresh)).toBe(true)
  })

  it('returns 0 when the tus-tmp dir is absent', async () => {
    fs.rmSync(tusDir, { recursive: true, force: true })
    expect(await reapStaleTusTmp(storageDir, 60 * 60 * 1000)).toBe(0)
  })
})
