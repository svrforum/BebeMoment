import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { computeBlurhash } from '@/domain/blurhash'
import { rgbToHex } from '@/domain/color'
import type { StorageAdapter } from '@bebe/storage'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import { type Trio, generateTrios } from './derivative-trios'

export type ProcessVideoInput = {
  originalKey: string
  assetId: string
}

export type ProcessVideoResult = {
  durationMs: number
  width: number | undefined
  height: number | undefined
  aspectRatio: number | null
  blurhash: string | null
  dominantColor: string | null
  derivatives: {
    v: 2
    thumb256: Trio
    thumb512: Trio
    display1080: Trio
    videoPoster: string
    videoCompat: string
  }
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
          'scale=1280:-2',
        ])
        .output(posterPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })

    const previewPath = path.join(work, 'preview.mp4')
    const previewPromise = new Promise<void>((resolve, reject) => {
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
          // 출력 프레임레이트를 30fps CFR 로 고정. 화면 녹화는 timebase 가
          // 90000 처럼 비정상적으로 큰 VFR 인 경우가 있는데, ffmpeg 5.x 는 출력
          // fps 미지정 시 이 timebase 를 CFR 프레임레이트로 써서 사실상 무한
          // 인코딩(수십 MB·끝나지 않음)에 빠진다. -r 30 으로 폭주를 막는다.
          '-r',
          '30',
          '-vf',
          // force_divisible_by=2 → 출력 width/height 를 짝수로 강제. libx264 +
          // yuv420p(4:2:0) 는 홀수 치수를 거부하는데, 세로 화면 녹화(예: 1080x2520)
          // 를 비율 유지로 축소하면 width 가 홀수(462.86…)가 돼 인코더 초기화가
          // 실패했다("Error while opening encoder … width or height").
          "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
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

    // Build the same image trio grid we generate for photos, sourced from the
    // poster frame. Done in parallel with the preview transcode.
    const posterBuf = await readFile(posterPath)
    let dominantColor: string | null = null
    try {
      const stats = await sharp(posterBuf, { failOn: 'none' }).stats()
      if (stats.channels.length >= 3) {
        const [r, g, b] = stats.channels
        dominantColor = rgbToHex(r?.mean ?? 0, g?.mean ?? 0, b?.mean ?? 0)
      }
    } catch {
      // best-effort
    }
    const blurhash = await computeBlurhash(posterBuf)
    const triosPromise = generateTrios({
      buffer: posterBuf,
      assetId: input.assetId,
      storage,
    })

    const posterKey = `derivatives/${input.assetId}/poster.jpg`
    const previewKey = `derivatives/${input.assetId}/preview.mp4`

    const [, trios] = await Promise.all([
      previewPromise.then(() => storage.write(previewKey, createReadStream(previewPath))),
      triosPromise,
    ])
    await storage.writeBuffer(posterKey, posterBuf, 'image/jpeg')

    const aspectRatio =
      width && height && width > 0 && height > 0 ? Number((width / height).toFixed(4)) : null

    return {
      durationMs,
      width,
      height,
      aspectRatio,
      blurhash,
      dominantColor,
      derivatives: {
        v: 2,
        thumb256: trios.thumb256,
        thumb512: trios.thumb512,
        display1080: trios.display1080,
        videoPoster: posterKey,
        videoCompat: previewKey,
      },
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
