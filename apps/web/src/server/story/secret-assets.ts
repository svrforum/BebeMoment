import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

/**
 * 비밀 스토리(가시성 `guardians`)에 묶인 자산 ID 집합. 이 자산들은 `family` 역할에게
 * **모든 자산 노출 지점**(타임라인·캘린더·추억·앨범·인물·위젯·단일뷰어)에서 숨겨야
 * 한다 — 스토리 카드뿐 아니라 사진 바이트 자체까지(요구사항: 비밀 스토리는 사진까지 숨김).
 *
 * 규칙(자산 중심·엄격): 한 자산이 비밀 스토리에 한 번이라도 속하면 family 에게 숨긴다.
 * 같은 자산이 가족 공개 스토리에도 들어 있어도 비공개가 우선(프라이버시 안전). 흔치 않은
 * 모순 케이스에서 노출 대신 누락을 택한다.
 *
 * StoryAsset 은 familyId 컬럼이 없는 조인 테이블이라 부모 Story 로 스코프한다(먼저 가족의
 * 비밀 스토리 id 를 가져온 뒤 그 entryId 로 링크 조회 — tenant 미들웨어 정합).
 */
export async function listSecretAssetIds(
  prismaPublic: PrismaPublic,
  familyId: string,
): Promise<string[]> {
  const secretStories = await prismaPublic.story.findMany({
    where: { familyId, deletedAt: null, visibility: 'guardians' },
    select: { id: true },
  })
  if (secretStories.length === 0) return []
  const links = await prismaPublic.storyAsset.findMany({
    where: { entryId: { in: secretStories.map((s) => s.id) } },
    select: { assetId: true },
  })
  return Array.from(new Set(links.map((l) => l.assetId)))
}

/**
 * 뷰어 역할에 따른 "숨길 자산 ID" — owner/guardian 은 전부 보므로 빈 배열(추가 쿼리 없음),
 * family 만 비밀 자산 집합을 돌려준다. 각 자산 목록 surface 가 이 결과로
 * `id NOT IN (...)`(또는 in-list 필터링)을 걸어 family 에게서 비밀 사진을 제외한다.
 */
export async function hiddenAssetIdsForViewer(
  viewerRole: Role | 'owner' | 'guardian' | 'family',
  prismaPublic: PrismaPublic,
  familyId: string,
): Promise<string[]> {
  if (viewerRole !== 'family') return []
  return listSecretAssetIds(prismaPublic, familyId)
}

/** family 가 특정 자산에 접근/액션할 수 있는지 — 비밀 자산이면 false. owner/guardian 은 항상 true. */
export async function isAssetHiddenFromViewer(
  viewerRole: Role | 'owner' | 'guardian' | 'family',
  assetId: string,
  prismaPublic: PrismaPublic,
  familyId: string,
): Promise<boolean> {
  if (viewerRole !== 'family') return false
  const secret = await listSecretAssetIds(prismaPublic, familyId)
  return secret.includes(assetId)
}
