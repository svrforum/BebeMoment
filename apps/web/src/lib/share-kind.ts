/**
 * 공유 링크의 종류. 발급·해석·관리 목록(서버)과 공유 시트·관리 화면(클라이언트)이 모두 이 목록에서
 * 출발한다 — 예전엔 같은 목록을 여러 파일에 손으로 옮겨 적었고, 일정 공유를 붙일 때 관리 화면 쪽이
 * 빠져 링크 목록에 메시지 키가 그대로 떴다.
 */
export const SHARE_KINDS = [
  'story',
  'asset',
  'album',
  'selection',
  'date',
  'memory',
  'schedule',
] as const

export type ShareKind = (typeof SHARE_KINDS)[number]

type ShareTargetFields = {
  story: { storyId: string }
  asset: { assetId: string }
  album: { albumId: string }
  selection: { assetIds: string[] }
  date: { date: string } // 'YYYY-MM-DD'
  // 추억 묶음 — 그 날짜의 사진 중 발급 순간에 고른 것으로 고정. 받은 사람은 그 사진 전부와
  // 그 사진이 담긴 스토리의 글을 본다(`memory-preview.ts`). 'date' 와 같은 target_date 열을 쓰고
  // share_link_assets 자식 row 가 있는지로 갈린다.
  memory: { date: string; assetIds: string[] }
  schedule: { entryId: string }
}

// SHARE_KINDS 에 종류를 더하고 필드를 안 적으면 여기서 컴파일 에러가 난다.
export type ShareTarget = { [K in ShareKind]: { kind: K } & ShareTargetFields[K] }[ShareKind]

/** 네임스페이스 `admin.share.kind`. `Record` 라 종류를 더하면 빠진 이름을 컴파일러가 잡는다. */
export const SHARE_KIND_LABEL_KEYS: Record<ShareKind, string> = {
  story: 'story',
  asset: 'asset',
  album: 'album',
  selection: 'selection',
  date: 'date',
  memory: 'memory',
  schedule: 'schedule',
}
