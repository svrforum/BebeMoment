// 서버 파서(app/api/asset/[id]/download/quality.ts)도 이 목록을 쓴다 — 한쪽에만 값을 넣으면
// 서버가 그 값을 auto 로 접어 버린다.
export const DOWNLOAD_QUALITIES = ['auto', 'original'] as const

export type DownloadQuality = (typeof DOWNLOAD_QUALITIES)[number]

export function assetDownloadHref(assetId: string, quality: DownloadQuality): string {
  return `/api/asset/${assetId}/download?q=${quality}`
}

// 메뉴 항목을 `<a download>` 로 두면 누르는 순간 메뉴가 닫히며 링크가 DOM 에서 빠지고,
// 연결되지 않은 링크는 이동하지 않아 저장이 조용히 안 된다 — 따로 붙였다 뗀다.
export function saveAsset(assetId: string, quality: DownloadQuality): void {
  const a = document.createElement('a')
  a.href = assetDownloadHref(assetId, quality)
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}
