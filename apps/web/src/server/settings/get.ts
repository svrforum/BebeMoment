import type { PrismaClient } from '@bebe/db'
import type { ZodType } from 'zod'

export async function getSetting<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  prisma: PrismaClient,
): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return defaultValue
  const parsed = schema.safeParse(row.value)
  return parsed.success ? parsed.data : defaultValue
}
