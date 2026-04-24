import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '@/server'
import { beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)

describe('GET /media/v1/files/:signed', () => {
  let storageRoot: string
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.STORAGE_MODE = 'local'
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-files-'))
    process.env.STORAGE_PATH = storageRoot

    const key = 'families/fam/assets/asset/original'
    const full = path.join(storageRoot, key)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'hello-bebe')
  })

  test('401 with invalid token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/files/not-a-valid-jwt',
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('200 streams bytes for valid token', async () => {
    const { signFileServeToken } = await import('@/lib/jwt')
    const token = await signFileServeToken({
      familyId: 'fam',
      assetId: 'asset',
      key: 'families/fam/assets/asset/original',
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/files/${token}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello-bebe')
    await app.close()
  })

  test('404 when file missing even with valid token', async () => {
    const { signFileServeToken } = await import('@/lib/jwt')
    const token = await signFileServeToken({
      familyId: 'fam',
      assetId: 'asset',
      key: 'families/fam/assets/asset/missing',
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/files/${token}`,
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
