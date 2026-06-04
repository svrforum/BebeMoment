import { ServiceError } from '@/server/error'
import { GRANTABLE_FAMILY_CAPABILITIES } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'

const GRANTABLE = new Set<string>(GRANTABLE_FAMILY_CAPABILITIES)

// 쓰기 경계 검증 — 일부 설정 키는 임의 값을 받으면 권한 상승 등 위험하므로 여기서
// 막는다(단일 쓰기 지점이라 모든 호출부 커버). permissions.family 는 family 역할에
// 부여 가능한 능력만 허용(member.* 등 owner 전용 주입 차단).
function validateSettingValue(key: string, value: unknown): void {
  if (key === 'permissions.family') {
    if (!Array.isArray(value) || value.some((c) => typeof c !== 'string' || !GRANTABLE.has(c))) {
      throw new ServiceError(400, 'admin.familyPermInvalid')
    }
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedByUserId: string | null,
  prisma: PrismaClient,
): Promise<void> {
  validateSettingValue(key, value)
  const existing = await prisma.appSetting.findUnique({ where: { key } })
  const oldValue = existing?.value ?? null
  // biome-ignore lint/suspicious/noExplicitAny: Prisma Json type requires access
  const next = value as any
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key },
      create: { key, value: next, updatedById: updatedByUserId },
      update: { value: next, updatedById: updatedByUserId },
    }),
    prisma.settingHistory.create({
      data: {
        key,
        // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
        oldValue: oldValue as any,
        // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
        newValue: next as any,
        changedBy: updatedByUserId,
      },
    }),
  ])
}
