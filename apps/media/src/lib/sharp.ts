import { availableParallelism } from 'node:os'
import sharp, { type Sharp, type SharpOptions } from 'sharp'
import { getEnv } from './env'

// 저사양 NAS 메모리 보호 — 디코드 픽셀 상한(기본 64MP, MEDIA_MAX_INPUT_PIXELS 로 조정).
// 상한을 넘는 입력(압축폭탄·초고해상도)은 sharp 가 throw 하고, 기존 process-asset try/catch
// 가 자산을 failed 로 처리한다(워커 크래시 없음). 모든 sharp() 디코드는 이 헬퍼를 거친다.
let maxInputPixels: number | undefined

// libvips 스레드 수는 명시한다 — 기본(코어 수 전부)은 잡 concurrency 와 곱해져 NAS 를
// 포화시켰다. MEDIA_VIPS_THREADS 미설정 시 코어의 절반.
function configure(): number {
  const env = getEnv()
  sharp.concurrency(env.MEDIA_VIPS_THREADS ?? Math.max(1, Math.floor(availableParallelism() / 2)))
  return env.MEDIA_MAX_INPUT_PIXELS
}

export function decodeSharp(input: Buffer | string, opts: SharpOptions = {}): Sharp {
  maxInputPixels ??= configure()
  return sharp(input, { failOn: 'none', limitInputPixels: maxInputPixels, ...opts })
}
