// 저장(다운로드) 때 원본을 그대로 줘도 되는지 판단한다.
//
// 폰 갤러리의 하드웨어 디코더는 8비트 4:2:0 밖으로 나가면 영상 트랙을 포기하고 오디오만
// 재생한다 — 카메라로 4:2:2 10비트로 찍은 클립을 저장하면 소리만 나던 게 이것이다.
// 그래서 확실히 재생되는 조합만 통과시키고, 나머지는 워커가 만들어 둔 호환본(preview.mp4)
// 으로 보낸다. 모르면 재생 불가로 본다 — 틀렸을 때 손해가 작은 쪽이다(화질 하락 < 재생 불가).

const PLAYABLE_CODECS = new Set(['h264', 'avc1', 'hevc', 'h265', 'hvc1'])
const PLAYABLE_PIX_FMTS = new Set(['yuv420p', 'yuvj420p', 'nv12'])

export function isBroadlyPlayableVideo(
  codecName: string | undefined,
  pixFmt: string | undefined,
): boolean {
  if (!codecName || !pixFmt) return false
  return PLAYABLE_CODECS.has(codecName.toLowerCase()) && PLAYABLE_PIX_FMTS.has(pixFmt.toLowerCase())
}

export type PreviewDecisionInput = {
  codecName: string | undefined
  pixFmt: string | undefined
  /** 회전 보정된 표시 치수. */
  width: number | undefined
  height: number | undefined
  /** 컨테이너 전체 비트레이트(bit/s). */
  bitRate: number | undefined
}

// 호환본(preview.mp4)은 폰·브라우저가 원본을 못 틀 때를 위한 것이다. 폰이 바로 재생하는
// 코덱이고 1080p(짧은 변 ≤1080, 긴 변 ≤1920)·6 Mbps 이하면 호환본은 같은 크기거나 더 큰
// 복사본일 뿐이라 만들지 않는다 — 원본이 곧 재생용이 된다. 치수·비트레이트를 모르면
// 안전한 쪽(호환본 생성)으로.
const PREVIEW_MAX_SHORT_SIDE = 1080
const PREVIEW_MAX_LONG_SIDE = 1920
const PREVIEW_MAX_BIT_RATE = 6_000_000

export function needsPreview(v: PreviewDecisionInput): boolean {
  if (!isBroadlyPlayableVideo(v.codecName, v.pixFmt)) return true
  if (v.width === undefined || v.height === undefined) return true
  if (v.bitRate === undefined || !Number.isFinite(v.bitRate)) return true
  const shortSide = Math.min(v.width, v.height)
  const longSide = Math.max(v.width, v.height)
  if (shortSide > PREVIEW_MAX_SHORT_SIDE || longSide > PREVIEW_MAX_LONG_SIDE) return true
  return v.bitRate > PREVIEW_MAX_BIT_RATE
}
