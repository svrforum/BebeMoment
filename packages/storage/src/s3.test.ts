import { Readable } from 'node:stream'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3Adapter } from './s3'

let container: StartedTestContainer
let adapter: S3Adapter

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

beforeAll(async () => {
  container = await new GenericContainer('minio/minio:RELEASE.2024-09-13T20-26-02Z')
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin',
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forLogMessage(/API:.*9000/))
    .start()

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`
  adapter = new S3Adapter({
    mode: 's3',
    endpoint,
    bucket: 'bebe-test',
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    region: 'us-east-1',
    forcePathStyle: true,
  })
  await adapter.createBucket()
}, 120_000)

afterAll(async () => {
  await container?.stop()
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
})
