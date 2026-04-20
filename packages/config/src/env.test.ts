import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('parses required env vars', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: 'a'.repeat(64),
      PUBLIC_URL: 'http://localhost:3000',
    })
    expect(env.DATABASE_URL).toBe('postgres://localhost:5432/bebe')
    expect(env.PORT).toBe(3000)
    expect(env.STORAGE_MODE).toBe('local')
  })

  it('rejects SECRET_KEY that is too short', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost:5432/bebe',
        REDIS_URL: 'redis://localhost:6379',
        SECRET_KEY: 'short',
        PUBLIC_URL: 'http://localhost:3000',
      }),
    ).toThrow(/SECRET_KEY/)
  })

  it('parses comma-separated admin emails', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: 'a'.repeat(64),
      PUBLIC_URL: 'http://localhost:3000',
      ADMIN_USER_EMAIL: 'a@b.com, c@d.com',
    })
    expect(env.ADMIN_USER_EMAILS).toEqual(['a@b.com', 'c@d.com'])
  })

  it('requires S3 env when STORAGE_MODE=s3', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost:5432/bebe',
        REDIS_URL: 'redis://localhost:6379',
        SECRET_KEY: 'a'.repeat(64),
        PUBLIC_URL: 'http://localhost:3000',
        STORAGE_MODE: 's3',
      }),
    ).toThrow(/STORAGE_S3_/)
  })
})
