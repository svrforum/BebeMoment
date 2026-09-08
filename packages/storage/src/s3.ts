import { type Readable, Transform, pipeline } from 'node:stream'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter, StorageConfig, StorageStat, WriteResult } from './types'

export class S3Adapter implements StorageAdapter {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(cfg: Extract<StorageConfig, { mode: 's3' }>) {
    this.bucket = cfg.bucket
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      forcePathStyle: cfg.forcePathStyle,
    })
  }

  async createBucket(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
    } catch (e) {
      const name = (e as { name?: string }).name
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw e
    }
  }

  async write(key: string, stream: NodeJS.ReadableStream): Promise<WriteResult> {
    // 바이트 수는 흘려보내며 센다 — 업로드 뒤 HeadObject 한 번을 아낀다. 소스 스트림 오류는
    // 카운터를 같은 오류로 destroy 해 Upload.done() 이 거부되게 한다.
    let size = 0
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length
        cb(null, chunk)
      },
    })
    pipeline(stream as Readable, counter, (err) => {
      if (err) counter.destroy(err)
    })
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: counter },
    })
    await upload.done()
    return { key, size }
  }

  async writeBuffer(key: string, data: Buffer, mimeType?: string): Promise<WriteResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      }),
    )
    return { key, size: data.length }
  }

  async read(key: string): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return res.Body as NodeJS.ReadableStream
  }

  async readRange(key: string, start: number, end: number): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${end}` }),
    )
    return res.Body as NodeJS.ReadableStream
  }

  async stat(key: string): Promise<StorageStat | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return {
        size: Number(res.ContentLength ?? 0),
        mtimeMs: res.LastModified ? res.LastModified.getTime() : null,
      }
    } catch (e) {
      const name = (e as { name?: string }).name
      if (name === 'NotFound' || name === 'NoSuchKey') return null
      throw e
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null
  }

  localPath(_key: string): null {
    return null
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async publicUrl(key: string, opts: { expiresIn?: number } = {}): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn ?? 900 })
  }

  async size(key: string): Promise<number> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
    return Number(res.ContentLength ?? 0)
  }
}
