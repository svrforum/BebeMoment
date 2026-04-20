import { can } from '@bebe/core'
import type { Baby, PrismaClient } from '@bebe/db'
import { z } from 'zod'

const Input = z.object({
  familyId: z.string().uuid(),
  name: z.string().min(1).max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).optional(),
  byUserId: z.string().uuid(),
})

export async function createBaby(raw: unknown, prisma: PrismaClient): Promise<Baby> {
  const input = Input.parse(raw)

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'baby.create')) {
    throw new Error('No permission to create baby in this family')
  }

  const birth = new Date(`${input.birthDate}T00:00:00Z`)
  if (birth.getTime() > Date.now()) {
    throw new Error('Birth date cannot be in the future')
  }

  return prisma.baby.create({
    data: {
      familyId: input.familyId,
      name: input.name,
      birthDate: birth,
      ...(input.birthTime !== undefined ? { birthTime: input.birthTime } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
    },
  })
}
