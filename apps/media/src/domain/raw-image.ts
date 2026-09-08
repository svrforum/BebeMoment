/** sharp `.raw().toBuffer({ resolveWithObject: true })` 의 결과 — 픽셀은 행 우선, 채널 인터리브. */
export type RawImage = {
  data: Buffer
  info: { width: number; height: number; channels: number }
}
