import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { encodeBlurhash } from '@/domain/blurhash'
import { averageColor } from '@/domain/color'
import { isBroadlyPlayableVideo, needsPreview } from '@/domain/video-compat'
import { getEnv } from '@/lib/env'
import { ffprobeJson, runFfmpeg } from '@/lib/ffmpeg'
import { Semaphore } from '@/lib/semaphore'
import type { StorageAdapter } from '@bebe/storage'
import { type Trio, generateTrios } from './derivative-trios'
import { videoCreatedAt } from './video-created-at'
import { orientedDimensions, parseDurationMs } from './video-meta'

export type ProcessVideoInput = {
  originalKey: string
  assetId: string
}

export type ProcessVideoResult = {
  /** 컨테이너 메타데이터의 촬영시각(벽시계-as-UTC). 없으면 undefined — 폴백에 맡긴다. */
  createdAt: Date | undefined
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
    /** 재생용 키 — 호환본이 필요 없는 원본이면 원본 키 그대로. */
    videoCompat: string
    originalPlayable: boolean
  }
}

// 트랜스코드는 잡 concurrency 와 별개로 상한을 둔다 — ffmpeg 하나가 코어를 다 쓰므로 영상
// 둘이 겹치면 NAS 에서 사진 처리까지 같이 느려진다(MEDIA_CONCURRENCY_VIDEO, 기본 1).
let videoSlots: Semaphore | undefined

function ffmpegThreads(): string {
  return String(getEnv().MEDIA_FFMPEG_THREADS ?? Math.max(1, availableParallelism() - 1))
}

// 로컬 스토리지면 최종 키 경로에 바로 쓴다(임시 파일 + 복사 생략). 원격이면 작업 디렉터리.
async function outputPath(
  storage: StorageAdapter,
  key: string,
  work: string,
  tmpName: string,
): Promise<string> {
  const direct = storage.localPath(key)
  if (!direct) return path.join(work, tmpName)
  await mkdir(path.dirname(direct), { recursive: true })
  return direct
}

export async function processVideo(
  input: ProcessVideoInput,
  storage: StorageAdapter,
): Promise<ProcessVideoResult> {
  videoSlots ??= new Semaphore(getEnv().MEDIA_CONCURRENCY_VIDEO)
  return videoSlots.run(() => transcode(input, storage))
}

async function transcode(
  input: ProcessVideoInput,
  storage: StorageAdapter,
): Promise<ProcessVideoResult> {
  const work = await mkdtemp(path.join(tmpdir(), `bebe-vid-${input.assetId}-`))
  try {
    const inPlace = storage.localPath(input.originalKey)
    const local = inPlace ?? path.join(work, 'input')
    if (!inPlace) await pipeline(await storage.read(input.originalKey), createWriteStream(local))

    const metadata = await ffprobeJson(local)
    const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
    // 컨테이너가 기록한 촬영시각. 영상엔 EXIF 가 없어 이게 유일한 진짜 출처다.
    const createdAt = videoCreatedAt(metadata.format.tags, process.env.TZ || 'UTC')
    const durationMs = parseDurationMs(metadata.format.duration)
    const { width, height } = orientedDimensions(videoStream)
    const threads = ffmpegThreads()

    const posterKey = `derivatives/${input.assetId}/poster.jpg`
    const previewKey = `derivatives/${input.assetId}/preview.mp4`

    const posterPath = await outputPath(storage, posterKey, work, 'poster.jpg')
    const posterTs = durationMs > 1500 ? 0.5 : 0
    await runFfmpeg([
      '-i',
      local,
      '-threads',
      threads,
      '-ss',
      String(posterTs),
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-vf',
      'scale=1280:-2',
      posterPath,
    ])

    const bitRate = Number(metadata.format.bit_rate)
    const makePreview = needsPreview({
      codecName: videoStream?.codec_name,
      pixFmt: videoStream?.pix_fmt,
      width,
      height,
      bitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : undefined,
    })
    let previewPromise: Promise<void> = Promise.resolve()
    if (makePreview) {
      const previewPath = await outputPath(storage, previewKey, work, 'preview.mp4')
      previewPromise = runFfmpeg([
        '-i',
        local,
        '-threads',
        threads,
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
        previewPath,
      ]).then(async () => {
        if (!storage.localPath(previewKey)) {
          await storage.write(previewKey, createReadStream(previewPath))
        }
      })
    }

    // Build the same image trio grid we generate for photos, sourced from the
    // poster frame. Done in parallel with the preview transcode.
    const posterBuf = await readFile(posterPath)
    const generated = generateTrios({ buffer: posterBuf, assetId: input.assetId, storage })
    const [, { trios, preview }] = await Promise.all([previewPromise, generated])
    if (!storage.localPath(posterKey)) {
      await storage.writeBuffer(posterKey, posterBuf, 'image/jpeg')
    }

    const aspectRatio =
      width && height && width > 0 && height > 0 ? Number((width / height).toFixed(4)) : null

    return {
      createdAt,
      durationMs,
      width,
      height,
      aspectRatio,
      blurhash: encodeBlurhash(preview),
      dominantColor: averageColor(preview),
      derivatives: {
        v: 2,
        thumb256: trios.thumb256,
        thumb512: trios.thumb512,
        display1080: trios.display1080,
        videoPoster: posterKey,
        videoCompat: makePreview ? previewKey : input.originalKey,
        originalPlayable: isBroadlyPlayableVideo(videoStream?.codec_name, videoStream?.pix_fmt),
      },
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
