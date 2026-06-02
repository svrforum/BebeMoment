import { describe, expect, it } from 'vitest'
import { redactSecrets } from './remote'

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
