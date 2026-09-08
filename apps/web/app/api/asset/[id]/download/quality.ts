import { z } from 'zod'

// 저장 품질은 둘뿐이다: auto(= 폰에서 열리는 파일, JPEG 사진은 갤러리용 재인코드)와
// original(= 저장된 바이트 그대로). 압축 다운로드 hd/sd 는 제거됐지만, 그 값을 담은
// 옛 클라이언트·북마크 URL 이 아직 돌아다닌다 — 400 으로 저장을 깨뜨리는 대신 기본
// 저장으로 접는다(오타·조작된 값도 마찬가지).
const QUALITY = z.enum(['auto', 'original']).catch('auto')

export type DownloadQuality = z.infer<typeof QUALITY>

export function parseDownloadQuality(raw: string | null): DownloadQuality {
  return QUALITY.parse(raw ?? 'auto')
}
