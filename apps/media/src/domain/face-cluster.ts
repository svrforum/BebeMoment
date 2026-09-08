import { FACE_CLUSTER_DISTANCE_MAX } from '@bebe/core'

/** 시간이 가까운 얼굴에 임계값을 얼마나 더 주는지. 기준 일수 안쪽이면 보너스를 그대로 준다. */
export const FACE_NEAR_IN_TIME_DAYS = 7
export const FACE_NEAR_IN_TIME_BONUS = 0.1

export type ClusterCandidate = {
  personId: string
  dist: number
  /** 이 얼굴이 찍힌 날과 지금 사진이 찍힌 날의 간격(일). 한쪽이라도 촬영일을 모르면 null. */
  gapDays: number | null
}

/**
 * 새 얼굴을 어느 사람에게 붙일지 — 가장 가까운 얼굴 하나를 보되, **촬영일이 가까우면
 * 임계값을 조금 넉넉히** 준다.
 *
 * 근거(라이브 측정, 87장 4개월): 같은 아기라도 같은 날 찍은 얼굴끼리는 평균 0.418,
 * 일주일 이상 벌어지면 0.613 으로 멀어진다. 신생아 때와 4개월 뒤 사진의 최소 거리는
 * 0.737 이었다. 즉 거리의 상당 부분이 "사람이 다르다"가 아니라 "시간이 지났다"에서 온다.
 * 며칠 안쪽 사진끼리는 조금 더 관대하게 보고, 시간이 먼 얼굴에는 원래 기준을 그대로 써서
 * 다른 사람이 섞일 위험은 늘리지 않는다.
 *
 * 후보는 벡터 거리 순으로 받는다 — 시간이 가까운 후보가 그 목록 밖에 있을 수 있지만,
 * 목록을 넓게 잡는 비용보다 낫고 못 잡아도 결과는 "새 사람"이라 안전한 쪽으로 틀린다.
 */
export function chooseCluster(
  candidates: ClusterCandidate[],
  opts: { maxDistance: number; nearDays?: number; nearBonus?: number },
): string | null {
  const nearDays = opts.nearDays ?? FACE_NEAR_IN_TIME_DAYS
  const nearBonus = opts.nearBonus ?? FACE_NEAR_IN_TIME_BONUS
  for (const c of candidates) {
    if (!Number.isFinite(c.dist)) continue
    const near = c.gapDays !== null && Number.isFinite(c.gapDays) && c.gapDays <= nearDays
    const limit = Math.min(FACE_CLUSTER_DISTANCE_MAX, opts.maxDistance + (near ? nearBonus : 0))
    if (c.dist <= limit) return c.personId
  }
  return null
}
