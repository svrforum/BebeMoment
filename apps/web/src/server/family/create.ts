import type { Family, Membership, PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { toSlug } from './slug'

const Input = z.object({
  name: z.string().min(1).max(80),
  userId: z.string().uuid(),
})

export type CreateFamilyResult = { family: Family; membership: Membership }
export type CreateFamilyOptions = { enforceSingle?: boolean }

export async function createFamily(
  raw: unknown,
  prisma: PrismaClient,
  opts: CreateFamilyOptions = {},
): Promise<CreateFamilyResult> {
  const input = Input.parse(raw)
  let slug = toSlug(input.name)

  for (let i = 0; i < 5; i++) {
    const existing = await prisma.family.findUnique({ where: { slug } })
    if (!existing) break
    slug = toSlug(`${input.name}-${Math.random().toString(36).slice(2, 6)}`)
  }

  return prisma.$transaction(async (tx) => {
    // 같은 트랜잭션 안에서 race-safe 하게 가족 수를 확인. tx.family.count() 는
    // familyId 필터가 없어 tenant 미들웨어(dev=throw)가 막으므로 raw 로 우회한다
    // ([[isRegistrationOpen]] 과 동일 이유 — 전역 카운트는 테넌트 비종속).
    if (opts.enforceSingle) {
      const rows = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM families`
      if ((rows[0]?.count ?? 0n) > 0n) {
        throw new Error('이미 가족이 설정되어 있어요')
      }
    }
    const family = await tx.family.create({
      data: {
        name: input.name,
        slug,
        createdByUserId: input.userId,
      },
    })
    const membership = await tx.membership.create({
      data: { familyId: family.id, userId: input.userId, role: 'owner' },
    })
    return { family, membership }
  })
}
