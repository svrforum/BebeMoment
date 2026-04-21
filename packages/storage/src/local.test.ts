import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalAdapter } from './local'

let tmp: string
let adapter: LocalAdapter

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'bebe-local-'))
  adapter = new LocalAdapter({ mode: 'local', path: tmp })
})
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

describe('LocalAdapter', () => {
  it('writes buffer and reads back', async () => {
    await adapter.writeBuffer('a/b/c.txt', Buffer.from('hello'))
    const stream = await adapter.read('a/b/c.txt')
    expect((await collect(stream)).toString()).toBe('hello')
  })

  it('writes stream and reports size', async () => {
    const stream = Readable.from(['hello ', 'world'])
    const result = await adapter.write('x.txt', stream)
    expect(result.size).toBe(11)
    expect(await adapter.size('x.txt')).toBe(11)
  })

  it('exists returns true for written key, false otherwise', async () => {
    await adapter.writeBuffer('found', Buffer.from('x'))
    expect(await adapter.exists('found')).toBe(true)
    expect(await adapter.exists('missing')).toBe(false)
  })

  it('delete removes key; second delete no-ops', async () => {
    await adapter.writeBuffer('rm-me', Buffer.from('x'))
    await adapter.delete('rm-me')
    expect(await adapter.exists('rm-me')).toBe(false)
    await expect(adapter.delete('rm-me')).resolves.toBeUndefined()
  })

  it('readRange returns byte slice', async () => {
    await adapter.writeBuffer('range.bin', Buffer.from('0123456789'))
    const s = await adapter.readRange('range.bin', 2, 4)
    expect((await collect(s)).toString()).toBe('234')
  })

  it('publicUrl returns /media/<key>', async () => {
    const url = await adapter.publicUrl('dir/file.png')
    expect(url).toBe('/media/dir/file.png')
  })

  it('prevents path traversal', async () => {
    await expect(adapter.writeBuffer('../escape.txt', Buffer.from('x'))).rejects.toThrow(
      /invalid key/i,
    )
    await expect(adapter.exists('../escape.txt')).rejects.toThrow(/invalid key/i)
  })
})
