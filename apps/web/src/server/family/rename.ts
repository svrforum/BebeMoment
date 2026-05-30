import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const NameSchema = z
  .string()
  .trim()
  .min(1, '가족 이름을 입력해주세요')
  .max(80, '이름이 너무 길어요')

/** 가족 이름 변경. Family 는 자체 id 가 anchor 라 tenant 미들웨어가 where.id 를 허용한다. */
export async function renameFamily(
  familyId: string,
  rawName: string,
  prisma: PrismaClient,
): Promise<{ id: string; name: string }> {
  const name = NameSchema.parse(rawName)
  const updated = await prisma.family.update({
    where: { id: familyId },
    data: { name },
    select: { id: true, name: true },
  })
  return updated
}
