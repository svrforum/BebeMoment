import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getStorage } from './storage'

describe('getStorage', () => {
  const saved = { mode: process.env.STORAGE_MODE, path: process.env.STORAGE_PATH }
  let dirA: string
  let dirB: string
  beforeAll(() => {
    dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-storage-a-'))
    dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-storage-b-'))
    process.env.STORAGE_MODE = 'local'
  })
  afterAll(() => {
    process.env.STORAGE_MODE = saved.mode
    process.env.STORAGE_PATH = saved.path
    fs.rmSync(dirA, { recursive: true, force: true })
    fs.rmSync(dirB, { recursive: true, force: true })
  })

  it('reuses one adapter per configuration and rebuilds it when the configuration changes', () => {
    process.env.STORAGE_PATH = dirA
    const a = getStorage()
    expect(getStorage()).toBe(a)
    expect(a.localPath('x')).toBe(path.join(dirA, 'x'))

    process.env.STORAGE_PATH = dirB
    const b = getStorage()
    expect(b).not.toBe(a)
    expect(b.localPath('x')).toBe(path.join(dirB, 'x'))
    expect(getStorage()).toBe(b)
  })
})
