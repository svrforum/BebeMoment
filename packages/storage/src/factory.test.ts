import { describe, expect, it } from 'vitest'
import { createAdapter } from './factory'
import { LocalAdapter } from './local'
import { S3Adapter } from './s3'

describe('createAdapter', () => {
  it('builds LocalAdapter for mode=local', () => {
    const a = createAdapter({ mode: 'local', path: '/tmp/x' })
    expect(a).toBeInstanceOf(LocalAdapter)
  })
  it('builds S3Adapter for mode=s3', () => {
    const a = createAdapter({
      mode: 's3',
      endpoint: 'http://localhost',
      bucket: 'b',
      accessKey: 'k',
      secretKey: 's',
      region: 'us-east-1',
      forcePathStyle: true,
    })
    expect(a).toBeInstanceOf(S3Adapter)
  })
  it('rejects invalid config', () => {
    // @ts-expect-error testing invalid input
    expect(() => createAdapter({ mode: 'gcs' })).toThrow()
  })
})
