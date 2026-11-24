/**
 * 공유 링크의 대상이 앱 안에서 열리는 화면. 공개 화면의 '앱에서 이어보기 / 로그인하고 전체 보기'
 * 버튼과, 가족으로 로그인한 사람을 공개 화면 대신 보내는 곳이 이 한 함수를 쓴다 — 둘이 다른
 * 화면을 가리키지 않게.
 *
 * 사진 묶음(한 장·여러 장 선택)은 여기에 없다 — 그 사진들만 모아 보여 주는 앱 화면이 없다.
 */
export type ShareDestination =
  | { kind: 'story'; publicNo: number }
  | { kind: 'album'; albumId: string }
  | { kind: 'day' | 'memory'; date: string }

export function shareInAppPath(d: ShareDestination): string {
  switch (d.kind) {
    case 'story':
      return `/story/${d.publicNo}`
    case 'album':
      return `/albums/${d.albumId}`
    case 'day':
    case 'memory':
      return `/timeline?date=${d.date}`
  }
}
