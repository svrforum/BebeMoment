import type { PrismaClient } from '@bebe/db-public'
import { cache } from 'react'
import type { ZodType } from 'zod'

/**
 * 요청 스코프 dedup — 한 렌더 안에서 같은 키를 여러 곳이 읽는다(레이아웃·페이지·서비스가
 * 각자 nav/permissions/features 를 묻는다). `cache()` 는 (prisma, key) 로 묶여 요청당 한
 * 번만 DB 에 가고, 요청 밖(테스트·워커·CLI)에선 no-op 이라 그냥 쿼리로 떨어진다.
 * 같은 요청에서 setSetting 뒤에 같은 키를 다시 읽는 경로는 없다(있으면 stale).
 */
const findSettingRow = cache((prisma: PrismaClient, key: string) =>
  prisma.appSetting.findUnique({ where: { key } }),
)

export async function getSetting<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  prisma: PrismaClient,
): Promise<T> {
  const row = await findSettingRow(prisma, key)
  if (!row) return defaultValue
  const parsed = schema.safeParse(row.value)
  return parsed.success ? parsed.data : defaultValue
}
