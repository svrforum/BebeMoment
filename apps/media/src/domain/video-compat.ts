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
