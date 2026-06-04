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

    const jpegKey = 'derivatives/asset/display1080.jpeg'
    const jpegFull = path.join(storageRoot, jpegKey)
    fs.mkdirSync(path.dirname(jpegFull), { recursive: true })
    fs.writeFileSync(jpegFull, 'jpeg-bytes')
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
    // 동일 오리진 저장형 XSS 방어 — 스니핑 차단 + inline.
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-type']).toBe('application/octet-stream')
    await app.close()
  })

  test('serves image derivative with image/jpeg content-type (OG 크롤러용) + nosniff', async () => {
    const { signFileServeToken } = await import('@/lib/jwt')
    const token = await signFileServeToken({
      familyId: 'fam',
      assetId: 'asset',
      key: 'derivatives/asset/display1080.jpeg',
    })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/media/v1/files/${token}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    // 올바른 mime + nosniff = 보안(HTML 스니핑 차단) 유지하면서 이미지 인식.
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    await app.close()
  })

  test('401 when key does not belong to the token familyId/assetId (IDOR guard)', async () => {
    // 토큰 claims(fam/asset)와 다른 경로의 실재 파일을 가리키는 토큰 — 가드 없으면
    // 200 으로 다른 자산 바이트가 새어나간다. prefix 결속으로 401 이어야 한다.
    const otherKey = 'families/other-fam/assets/other-asset/original'
    const full = path.join(storageRoot, otherKey)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'secret-other-family')

    const { signFileServeToken } = await import('@/lib/jwt')
    const token = await signFileServeToken({
      familyId: 'fam',
      assetId: 'asset',
      key: otherKey,
    })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/media/v1/files/${token}` })
    expect(res.statusCode).toBe(401)
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
