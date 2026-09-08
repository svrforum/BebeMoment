import { spawn } from 'node:child_process'

export type FfprobeStream = {
  index?: number
  codec_type?: string
  codec_name?: string
  pix_fmt?: string
  width?: number
  height?: number
  bit_rate?: string
  tags?: Record<string, unknown>
  side_data_list?: Array<Record<string, unknown>>
}

export type FfprobeFormat = {
  duration?: string
  bit_rate?: string
  size?: string
  tags?: Record<string, unknown>
}

export type FfprobeResult = {
  streams: FfprobeStream[]
  format: FfprobeFormat
}

export class FfmpegError extends Error {
  readonly code: number | null
  readonly stderr: string
  constructor(bin: string, code: number | null, stderr: string) {
    const last = stderr.trim().split('\n').pop() ?? ''
    super(`${bin} exited with code ${code}${last ? `: ${last}` : ''}`)
    this.name = 'FfmpegError'
    this.code = code
    this.stderr = stderr
  }
}

// 긴 트랜스코드의 stderr 를 전부 들고 있지 않는다 — 실패 진단엔 꼬리만 있으면 된다.
const STDERR_KEEP_BYTES = 16 * 1024

function run(bin: string, args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let errBytes = 0
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => {
      err.push(c)
      errBytes += c.length
      while (errBytes > STDERR_KEEP_BYTES && err.length > 1) {
        errBytes -= err.shift()?.length ?? 0
      }
    })
    child.once('error', reject)
    child.once('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8')
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr })
      else reject(new FfmpegError(bin, code, stderr))
    })
  })
}

/** ffmpeg 실행. 기존 출력은 덮어쓴다(재시도가 같은 경로에 다시 쓴다). 실패는 stderr 꼬리와 함께 throw. */
export async function runFfmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args])
}

export async function ffprobeJson(file: string): Promise<FfprobeResult> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ])
  let parsed: Partial<FfprobeResult>
  try {
    parsed = JSON.parse(stdout.toString('utf8')) as Partial<FfprobeResult>
  } catch {
    throw new FfmpegError('ffprobe', 0, 'ffprobe produced no JSON')
  }
  return { streams: parsed.streams ?? [], format: parsed.format ?? {} }
}
