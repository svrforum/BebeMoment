import type { PrismaClient } from '@bebe/db-media'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 업로드 진행 하트비트 — tus PATCH 로 바이트가 도착할 때마다 자산 행의 `updated_at` 을 민다.
 *
 * 중단된 업로드를 걸러내는 유일한 신호가 `updated_at` 인데, 그 값은 init 에서 한 번
 * 찍히고 업로드가 끝날 때까지 그대로였다. 그래서 "죽은 업로드"와 "느린 망에서 아직
 * 올라오는 중인 대용량 영상"을 구분할 수가 없어 정리 기준을 6시간까지 늘려야 했고,
 * 그 사이 미완성 자산이 타임라인·스토리에 멀쩡한 사진·영상처럼 남았다(128MB 영상이
 * 마지막 조각을 못 올린 채 재생 버튼만 달고 스토리에 앉아 있던 회귀).
 * 바이트가 흐르는 동안 행을 밀어 두면 짧은 기준으로도 살아 있는 업로드를 죽이지 않는다.
 *
 * `uploading` 인 행만 민다 — 이미 끝났거나 실패한 자산의 시각을 뒤늦은 요청이 흔들지 않게.
 */
export async function touchUploadProgress(assetId: string, prisma: PrismaClient): Promise<boolean> {
  if (!UUID_RE.test(assetId)) return false
  const n = await prisma.$executeRaw`
    UPDATE media.assets
       SET updated_at = now()
     WHERE id = ${assetId}::uuid
       AND status = 'uploading'
       AND deleted_at IS NULL`
  return n > 0
}
