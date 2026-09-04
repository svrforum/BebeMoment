/**
 * 공유 시트가 링크와 함께 보내는 한 줄 제목(카카오톡 메시지 본문의 첫 줄, Web Share 의 title).
 * 스토리·앨범은 자기 제목을 쓰고, 사진·날짜는 대상을 설명하는 문구를 만든다.
 */
export type ShareTitleTarget =
  | { kind: 'story'; storyId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'date'; date: string }
  | { kind: 'selection'; assetIds: string[] }

type Translate = (key: string, values?: Record<string, string | number>) => string

export function shareTitle(
  target: ShareTitleTarget,
  t: Translate,
  locale: string,
  given?: string,
): string {
  switch (target.kind) {
    case 'story':
      return given?.trim() || t('share.text.story')
    case 'album':
      return given?.trim() || t('share.text.album')
    case 'asset':
      return t('share.text.asset')
    case 'selection':
      return t('share.text.selection', { n: target.assetIds.length })
    case 'date': {
      // takenAt 은 wall-clock-as-UTC 라 UTC 로 포맷해야 날짜가 밀리지 않는다.
      const monthDay = new Intl.DateTimeFormat(locale, {
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
      return t('share.text.date', {
        date: monthDay.format(new Date(`${target.date}T00:00:00.000Z`)),
      })
    }
  }
}
