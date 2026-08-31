import type { PrismaClient } from '@bebe/db-media'
import type pino from 'pino'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
// 처리는 업로드보다 오래 걸릴 수 있다(큰 영상 트랜스코딩). 정상 작업을 실패로 찍지 않게
// 넉넉히 잡는다 — 그래도 영원히 갇히는 것보다는 낫다.
const PROCESSING_STALE_MS = 12 * 60 * 60 * 1000

/**
 * 중단된 업로드 정리 — 업로드 토큰 TTL(15분)을 한참 넘겨 still `uploading` 인 자산은
 * 영영 완료되지 않는다(브라우저가 tus 업로드 중 닫힘 등). 그대로 두면 행이 무한히
 * 쌓인다. 기준 시간(기본 6시간)보다 오래된 uploading 을 `failed` 로 표시한다.
 *
 * 가족 경계를 넘는 전역 스윕이라 raw SQL 로 — tenant 미들웨어($extends)는 모델
 * 오퍼레이션만 가로채고 $executeRaw 는 통과한다(§8, isRegistrationOpen 과 동일 패턴).
 * 반환값은 정리된 행 수.
 */
export async function reapStaleUploads(
  prisma: PrismaClient,
  logger: pino.Logger,
  olderThanMs: number = SIX_HOURS_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const n = await prisma.$executeRaw`
    UPDATE media.assets
       SET status = 'failed',
           processing_error = '업로드가 완료되지 않았어요 (중단됨)',
           updated_at = now()
     WHERE status = 'uploading'
       AND deleted_at IS NULL
       AND updated_at < ${cutoff}`
  if (n > 0) logger.warn({ count: n }, 'reaped stale uploading assets')
  return n
}

/**
 * `processing` 에서 갇힌 자산 정리.
 *
 * 예전엔 여기서 빠져나올 길이 아예 없었다: 이 스윕이 `uploading` 만 봤고, 재시도 API 는
 * `failed` 만 받았다. tus 훅이 상태를 `processing` 으로 커밋한 **뒤** 큐에 넣으므로 그 사이
 * Redis 가 흔들리거나 잡이 두 번 stall 되면 그 사진은 영영 처리되지도, 재시도되지도 않았다
 * (큐 볼륨을 비우라고 안내하는 Valkey 이전 절차도 같은 경로다).
 *
 * `failed` 로 내려놓으면 사용자가 재시도·삭제할 수 있게 된다 — 원본 바이트는 그대로다.
 */
export async function reapStuckProcessing(
  prisma: PrismaClient,
  logger: pino.Logger,
  olderThanMs: number = PROCESSING_STALE_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const n = await prisma.$executeRaw`
    UPDATE media.assets
       SET status = 'failed',
           processing_error = '처리가 끝나지 않았어요 (중단됨) — 다시 시도할 수 있어요',
           updated_at = now()
     WHERE status = 'processing'
       AND deleted_at IS NULL
       AND updated_at < ${cutoff}`
  if (n > 0) logger.warn({ count: n }, 'reaped stuck processing assets')
  return n
}
