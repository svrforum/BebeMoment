import { parseEnv } from '@bebe/config'
import { afterEach, describe, expect, test } from 'vitest'
import { assertServerSecrets, mediaJwtSecret, mediaPublicBase, mediaServiceToken } from './env'

const BASE = {
  DATABASE_URL: 'postgres://u:p@db.invalid:5432/x',
  REDIS_URL: 'redis://cache.invalid:6379',
  SECRET_KEY: 's'.repeat(40),
  PUBLIC_URL: 'http://app.invalid',
}
const JWT = 'j'.repeat(40)
const TOKEN = 't'.repeat(40)

describe('assertServerSecrets', () => {
  test.each(['server', 'both'])('MEDIA_ROLE=%s without the service token fails', (role) => {
    const env = parseEnv({ ...BASE, MEDIA_ROLE: role, MEDIA_JWT_SECRET: JWT })
    expect(() => assertServerSecrets(env)).toThrow(/MEDIA_SERVICE_TOKEN/)
  })

  test.each(['server', 'both'])('MEDIA_ROLE=%s without the JWT secret fails', (role) => {
    const env = parseEnv({ ...BASE, MEDIA_ROLE: role, MEDIA_SERVICE_TOKEN: TOKEN })
    expect(() => assertServerSecrets(env)).toThrow(/MEDIA_JWT_SECRET/)
  })

  test('an empty value counts as missing — compose passes an unset var as ""', () => {
    const env = parseEnv({ ...BASE, MEDIA_JWT_SECRET: '', MEDIA_SERVICE_TOKEN: '' })
    expect(() => assertServerSecrets(env)).toThrow(/MEDIA_SERVICE_TOKEN.*MEDIA_JWT_SECRET/)
  })

  test('the default role (both) needs them too', () => {
    expect(() => assertServerSecrets(parseEnv(BASE))).toThrow()
  })

  test('a short secret never reaches the check — the schema refuses it', () => {
    expect(() =>
      parseEnv({ ...BASE, MEDIA_JWT_SECRET: 'short', MEDIA_SERVICE_TOKEN: TOKEN }),
    ).toThrow(/MEDIA_JWT_SECRET/)
  })

  test('the worker role signs nothing and boots without them', () => {
    expect(() => assertServerSecrets(parseEnv({ ...BASE, MEDIA_ROLE: 'worker' }))).not.toThrow()
  })

  test('passes when both are set', () => {
    const env = parseEnv({ ...BASE, MEDIA_JWT_SECRET: JWT, MEDIA_SERVICE_TOKEN: TOKEN })
    expect(() => assertServerSecrets(env)).not.toThrow()
  })
})

describe('request-time accessors', () => {
  const saved = {
    MEDIA_JWT_SECRET: process.env.MEDIA_JWT_SECRET,
    MEDIA_SERVICE_TOKEN: process.env.MEDIA_SERVICE_TOKEN,
    MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL,
  }
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('return the configured secrets', () => {
    process.env.MEDIA_JWT_SECRET = JWT
    process.env.MEDIA_SERVICE_TOKEN = TOKEN
    expect(mediaJwtSecret()).toBe(JWT)
    expect(mediaServiceToken()).toBe(TOKEN)
  })

  test('follow a changed value instead of serving a stale one', () => {
    process.env.MEDIA_JWT_SECRET = JWT
    expect(mediaJwtSecret()).toBe(JWT)
    process.env.MEDIA_JWT_SECRET = 'k'.repeat(40)
    expect(mediaJwtSecret()).toBe('k'.repeat(40))
  })

  test('refuse a missing or short secret', () => {
    delete process.env.MEDIA_SERVICE_TOKEN
    expect(() => mediaServiceToken()).toThrow(/MEDIA_SERVICE_TOKEN/)
    process.env.MEDIA_JWT_SECRET = 'short'
    expect(() => mediaJwtSecret()).toThrow(/MEDIA_JWT_SECRET/)
  })

  test('the public base is empty when unset and loses its trailing slash', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = ''
    expect(mediaPublicBase()).toBe('')
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.example.com/'
    expect(mediaPublicBase()).toBe('https://media.example.com')
  })
})
