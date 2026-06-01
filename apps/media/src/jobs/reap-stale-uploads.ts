import type { PrismaClient } from '@bebe/db-media'
import type pino from 'pino'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

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
