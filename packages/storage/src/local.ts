import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { StorageAdapter, StorageConfig, WriteResult } from './types'

export class LocalAdapter implements StorageAdapter {
  private readonly root: string

  constructor(cfg: Extract<StorageConfig, { mode: 'local' }>) {
    this.root = path.resolve(cfg.path)
  }

  // 키를 root 기준으로 resolve 한 뒤 결과가 root 안에 있는지 확인한다(blocklist 정규식
  // 대신 canonical containment). 절대경로(키가 / 로 시작)·`..` 트래버설·심볼릭 형태
  // 모두 root 밖으로 나가면 거부 — 한 가지 검사로 모든 탈출 형태를 막는다.
  private resolve(key: string): string {
    if (key.includes('\0')) throw new Error(`invalid key: ${key}`)
    const full = path.resolve(this.root, key)
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`invalid key: ${key}`)
    }
    return full
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
    this.resolve(key) // 검증 목적(root 이탈 키 거부) — 반환은 그대로 URL.
    return `/media/${key}`
  }

  async size(key: string): Promise<number> {
    const s = await stat(this.resolve(key))
    return s.size
  }
}
