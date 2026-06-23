import sharp, { type Sharp, type SharpOptions } from 'sharp'

// 저사양 NAS 메모리 보호 — 디코드 픽셀 상한(기본 64MP, MEDIA_MAX_INPUT_PIXELS 로 조정).
// 상한을 넘는 입력(압축폭탄·초고해상도)은 sharp 가 throw 하고, 기존 process-asset try/catch
// 가 자산을 failed 로 처리한다(워커 크래시 없음). 모든 sharp() 디코드는 이 헬퍼를 거친다.
const MAX_INPUT_PIXELS = Number(process.env.MEDIA_MAX_INPUT_PIXELS ?? 64_000_000)

export function decodeSharp(input: Buffer | string, opts: SharpOptions = {}): Sharp {
  return sharp(input, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS, ...opts })
}
