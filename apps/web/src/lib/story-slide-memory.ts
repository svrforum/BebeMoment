const PREFIX = 'story:'

/** 스토리 캐러셀이 마지막으로 보여준 사진 — 전체화면에 다녀와도 그 자리로 돌아온다. */
export function storySlideKey(entryId: string): string {
  return `bebe.story.${entryId}.slide`
}

/** 뷰어의 `ctx` 는 `story:<entryId>` 형태. 스토리에서 열린 게 아니면 null. */
export function storyEntryIdFromCtx(ctx: string | null | undefined): string | null {
  if (!ctx?.startsWith(PREFIX)) return null
  const id = ctx.slice(PREFIX.length)
  return id.length > 0 ? id : null
}

export function rememberStorySlide(entryId: string | null, assetId: string): void {
  if (!entryId) return
  try {
    sessionStorage.setItem(storySlideKey(entryId), assetId)
  } catch {}
}

export function recallStorySlide(entryId: string): string | null {
  try {
    return sessionStorage.getItem(storySlideKey(entryId))
  } catch {
    return null
  }
}
