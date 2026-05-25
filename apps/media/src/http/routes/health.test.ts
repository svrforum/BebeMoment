import { buildApp } from '@/server'
import { describe, expect, test } from 'vitest'

describe('GET /media/v1/health', () => {
  test('returns ok payload', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/media/v1/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ v: 1, ready: true })
    expect(body.version).toBeDefined()
    await app.close()
  })

  test('propagates X-Request-Id', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/health',
      headers: { 'x-request-id': 'test-request-id' },
    })
    expect(res.headers['x-request-id']).toBe('test-request-id')
    await app.close()
  })

  test('generates X-Request-Id when missing', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/media/v1/health' })
    expect(res.headers['x-request-id']).toBeDefined()
    expect(typeof res.headers['x-request-id']).toBe('string')
    await app.close()
  })
})
