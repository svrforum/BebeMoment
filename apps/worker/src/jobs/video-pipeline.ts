import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { StorageAdapter } from '@bebe/storage'
import ffmpeg from 'fluent-ffmpeg'

export type ProcessVideoInput = {
  originalKey: string
  assetId: string
}

export type ProcessVideoResult = {
  durationMs: number
  width: number | undefined
  height: number | undefined
  derivatives: { poster: string; preview_video: string }
}

async function writeToLocal(
  storage: StorageAdapter,
  key: string,
  localPath: string,
): Promise<void> {
  const readStream = await storage.read(key)
  await pipeline(readStream, createWriteStream(localPath))
}

export async function processVideo(
  input: ProcessVideoInput,
  storage: StorageAdapter,
): Promise<ProcessVideoResult> {
  const work = await mkdtemp(path.join(tmpdir(), `bebe-vid-${input.assetId}-`))
  try {
    const local = path.join(work, 'input')
    await writeToLocal(storage, input.originalKey, local)

    const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(local, (err, data) => (err ? reject(err) : resolve(data)))
    })

    const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
    const durationMs = Math.round(Number(metadata.format.duration ?? 0) * 1000)
    const width = videoStream?.width
    const height = videoStream?.height

    const posterPath = path.join(work, 'poster.jpg')
    const posterTs = durationMs > 1500 ? 0.5 : 0
    await new Promise<void>((resolve, reject) => {
      ffmpeg(local)
        .outputOptions([
          '-ss',
          String(posterTs),
          '-frames:v',
          '1',
          '-q:v',
          '3',
          '-vf',
          'scale=720:-2',
        ])
        .output(posterPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })

    const previewPath = path.join(work, 'preview.mp4')
    await new Promise<void>((resolve, reject) => {
      ffmpeg(local)
        .outputOptions([
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-vf',
          "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
        ])
        .output(previewPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })

    const posterKey = `derivatives/${input.assetId}/poster.jpg`
    const previewKey = `derivatives/${input.assetId}/preview.mp4`
    await storage.writeBuffer(posterKey, await readFile(posterPath), 'image/jpeg')
    await storage.write(previewKey, createReadStream(previewPath))

    return {
      durationMs,
      width,
      height,
      derivatives: { poster: posterKey, preview_video: previewKey },
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
