import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3Adapter } from './s3'
import { TEST_S3_CREDENTIALS, type TestS3, startTestS3 } from './test-s3'

let s3: TestS3 | undefined
let adapter: S3Adapter

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

beforeAll(async () => {
  s3 = await startTestS3()
  adapter = new S3Adapter({
    mode: 's3',
    endpoint: s3.endpoint,
    bucket: 'bebe-test',
    ...TEST_S3_CREDENTIALS,
    forcePathStyle: true,
  })
  await adapter.createBucket()
}, 120_000)

afterAll(async () => {
  await s3?.stop()
})

describe('S3Adapter', () => {
  it('writes and reads buffer', async () => {
    await adapter.writeBuffer('hello.txt', Buffer.from('world'))
    const s = await adapter.read('hello.txt')
    expect((await collect(s)).toString()).toBe('world')
  })

  it('writes stream', async () => {
    const stream = Readable.from(['ab', 'cde'])
    const r = await adapter.write('stream.bin', stream)
    expect(r.size).toBe(5)
  })

  it('exists / delete', async () => {
    await adapter.writeBuffer('del.txt', Buffer.from('x'))
    expect(await adapter.exists('del.txt')).toBe(true)
    await adapter.delete('del.txt')
    expect(await adapter.exists('del.txt')).toBe(false)
  })

  it('publicUrl returns presigned URL', async () => {
    await adapter.writeBuffer('presign.txt', Buffer.from('x'))
    const url = await adapter.publicUrl('presign.txt', { expiresIn: 60 })
    expect(url).toMatch(/^http/)
    expect(url).toContain('presign.txt')
    expect(url).toContain('X-Amz-Signature')
  })

  it('readRange returns byte slice', async () => {
    await adapter.writeBuffer('range.bin', Buffer.from('0123456789'))
    const s = await adapter.readRange('range.bin', 2, 4)
    expect((await collect(s)).toString()).toBe('234')
  })

  it('stat returns size and last-modified, null when missing', async () => {
    await adapter.writeBuffer('stat.bin', Buffer.from('0123456789'))
    const s = await adapter.stat('stat.bin')
    expect(s?.size).toBe(10)
    expect(s?.mtimeMs).toBeGreaterThan(0)
    expect(await adapter.stat('missing.bin')).toBeNull()
  })

  it('has no local path', () => {
    expect(adapter.localPath('stat.bin')).toBeNull()
  })

  it('write counts bytes while streaming (no HeadObject round trip)', async () => {
    const chunks = ['a'.repeat(1000), 'b'.repeat(2345)]
    const r = await adapter.write('counted.bin', Readable.from(chunks))
    expect(r.size).toBe(3345)
    expect(await adapter.size('counted.bin')).toBe(3345)
  })
})
