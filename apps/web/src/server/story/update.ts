import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const MOODS = ['happy', 'grateful', 'tired', 'sad', 'proud', 'calm'] as const

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  patch: z.object({
    babyId: z.string().uuid().nullable().optional(),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    title: z.string().max(120).nullable().optional(),
    body: z.string().min(1).max(20000).optional(),
    mood: z.enum(MOODS).nullable().optional(),
    assetIds: z.array(z.string().uuid()).max(10).optional(),
  }),
})

export async function updateStoryEntry(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<Story> {
  const input = Input.parse(raw)
  const entry = await prismaPublic.story.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!entry) {
    throw new Error('Entry not found')
  }
  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const isOwn = entry.createdByUserId === input.byUserId
  if (!resolveCan(membership.role, isOwn ? 'record.edit.own' : 'record.edit.any', familyCaps)) {
    throw new Error('No permission to edit this entry')
  }
  if (input.patch.babyId) {
    const baby = await prismaPublic.baby.findFirst({
      where: { id: input.patch.babyId, familyId: input.familyId, deletedAt: null },
    })
    if (!baby) {
      throw new Error('baby does not belong to this family')
    }
  }
  if (input.patch.assetIds && input.patch.assetIds.length > 0) {
    // Status check intentionally relaxed (matches create.ts): 편집에서 방금 올린
    // 사진은 저장 시점에 아직 `uploading`/`processing` 일 수 있다. 가족 소유 +
    // 미삭제만 검증하고, 상태가 `ready` 로 바뀌면 타임라인이 최종 URL 을 잡는다.
    // (status:'ready' 를 요구하면 새 업로드가 "one or more assets invalid" 로 실패.)
    const count = await prismaMedia.asset.count({
      where: {
        id: { in: input.patch.assetIds },
        familyId: input.familyId,
        deletedAt: null,
      },
    })
    if (count !== input.patch.assetIds.length) throw new Error('one or more assets invalid')
  }

  const data: Record<string, unknown> = {}
  if (input.patch.babyId !== undefined) data.babyId = input.patch.babyId
  if (input.patch.entryDate) data.entryDate = new Date(`${input.patch.entryDate}T00:00:00Z`)
  if (input.patch.title !== undefined) data.title = input.patch.title
  if (input.patch.body !== undefined) data.body = input.patch.body
  if (input.patch.mood !== undefined) data.mood = input.patch.mood
  if (input.patch.assetIds !== undefined) {
    data.assets = {
      deleteMany: {},
      create: input.patch.assetIds.map((aid, idx) => ({ assetId: aid, order: idx })),
    }
  }
  return prismaPublic.story.update({
    where: { id: input.id, familyId: input.familyId },
    data,
  })
}
