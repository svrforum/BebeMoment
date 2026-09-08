import { getSetting } from '@/server/settings/get'
import {
  DEFAULT_FACE_CLUSTER_DISTANCE,
  FACE_CLUSTER_DISTANCE_MAX,
  FACE_CLUSTER_DISTANCE_MIN,
} from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

export type BackfillScope = 'missing' | 'all'

export type FaceBackfillPlan = {
  /** 다시 볼 사진 수(상한 적용 후). */
  queued: number
  /** 상한 때문에 이번에 빠진 사진 수 — 0 이 아니면 한 번 더 돌리면 된다. */
  remaining: number
}

/** 한 번에 큐에 넣는 상한. 사이드카가 사진 한 장에 수백 ms 를 쓰므로 무한정 밀어넣지 않는다. */
export const FACE_BACKFILL_BATCH = 300

/**
 * 이미 올라와 있는 사진을 다시 얼굴 인식한다.
 *
 * 왜 필요한가: 탐지 로직이 바뀌면(예: 누운 얼굴을 위해 회전 재시도 추가) 그 전에 올라온
 * 사진은 그대로 남는다. 새 사진에만 적용되면 "어떤 사진은 되고 어떤 사진은 안 되는" 상태가
 * 영원히 남으므로, 관리자가 소급 적용할 수 있어야 한다.
 *
 * scope='missing' 은 얼굴이 하나도 없는 사진만(대부분의 경우 이걸로 충분하고 싸다),
 * 'all' 은 전부 다시 본다. 잡은 멱등이다 — face-detect 가 그 사진의 기존 얼굴을 지우고
 * 다시 넣으므로 중복이 쌓이지 않는다.
 */
export async function planFaceBackfill(
  args: { familyId: string; scope: BackfillScope; limit?: number },
  prismaMedia: PrismaMedia,
): Promise<{ assetIds: string[]; plan: FaceBackfillPlan }> {
  const limit = Math.max(1, Math.min(FACE_BACKFILL_BATCH, args.limit ?? FACE_BACKFILL_BATCH))
  const rows = await prismaMedia.$queryRawUnsafe<{ id: string }[]>(
    `SELECT a.id
       FROM media.assets a
      WHERE a.family_id = $1::uuid AND a.status = 'ready' AND a.deleted_at IS NULL
        AND a.duplicate_of IS NULL AND a.kind = 'image'
        ${args.scope === 'missing' ? 'AND NOT EXISTS (SELECT 1 FROM media.faces f WHERE f.asset_id = a.id)' : ''}
      ORDER BY a.taken_at DESC
      LIMIT $2`,
    args.familyId,
    limit + 1,
  )
  const assetIds = rows.slice(0, limit).map((r) => r.id)
  return {
    assetIds,
    plan: { queued: assetIds.length, remaining: rows.length > limit ? 1 : 0 },
  }
}

/** 워커가 쓰는 것과 같은 군집 거리 설정(범위 clamp 포함). */
export async function faceClusterDistance(prismaPublic: PrismaPublic): Promise<number> {
  const raw = await getSetting(
    'faces.cluster_distance',
    z.number().finite(),
    DEFAULT_FACE_CLUSTER_DISTANCE,
    prismaPublic,
  )
  return Math.min(FACE_CLUSTER_DISTANCE_MAX, Math.max(FACE_CLUSTER_DISTANCE_MIN, raw))
}
