import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { StorageAdapter, StorageConfig, WriteResult } from './types'

const KEY_INVALID = /(^\/|\.\.|\\)/

function ensureSafeKey(key: string): void {
  if (KEY_INVALID.test(key)) throw new Error(`invalid key: ${key}`)
}

export class LocalAdapter implements StorageAdapter {
  private readonly root: string

  constructor(cfg: Extract<StorageConfig, { mode: 'local' }>) {
    this.root = path.resolve(cfg.path)
  }

  private resolve(key: string): string {
    ensureSafeKey(key)
    return path.join(this.root, key)
  }

  async write(key: string, stream: NodeJS.ReadableStream): Promise<WriteResult> {
    const full = this.resolve(key)
    await mkdir(path.dirname(full), { recursive: true })
    const out = createWriteStream(full)
    await pipeline(stream, out)
    const s = await stat(full)
    return { key, size: s.size }
  }

  async writeBuffer(key: string, data: Buffer): Promise<WriteResult> {
    const full = this.resolve(key)
    await mkdir(path.dirname(full), { recursive: true })
    await pipeline(
      (async function* () {
        yield data
      })(),
      createWriteStream(full),
    )
    return { key, size: data.length }
  }

  async read(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.resolve(key))
  }

  async readRange(key: string, start: number, end: number): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.resolve(key), { start, end })
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key))
      return true
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'ENOENT') return false
      throw e
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key))
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') throw e
    }
  }

  async publicUrl(key: string): Promise<string> {
    ensureSafeKey(key)
    return `/media/${key}`
  }

  async size(key: string): Promise<number> {
    const s = await stat(this.resolve(key))
    return s.size
  }
}
