import { softDeleteAsset } from '@/server/asset/soft-delete'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient } from '@bebe/db-public'
import type IORedis from 'ioredis'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  // true 면 스토리에 포함된 사진도 함께 휴지통으로(자산별 권한·앨범 분리·SSE 처리).
  deleteAssets: z.boolean().optional(),
})

export async function softDeleteStoryEntry(
  raw: unknown,
  prisma: PrismaClient,
  prismaMedia?: PrismaMedia,
  publisher?: IORedis,
): Promise<void> {
  const input = Input.parse(raw)
  const entry = await prisma.story.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!entry) {
    throw new Error('Entry not found')
  }
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const familyCaps = await getFamilyCapabilities(prisma)
  const isOwn = entry.createdByUserId === input.byUserId
  const capability = isOwn ? 'record.delete.own' : 'record.delete.any'
  if (!resolveCan(membership.role, capability, familyCaps))
    throw new Error('No permission to delete this entry')

  await prisma.story.update({
    where: { id: input.id, familyId: input.familyId },
    data: { deletedAt: new Date() },
  })

  // 사용자가 "사진도 함께 삭제"를 선택하면 포함 자산을 휴지통으로. 자산별 권한은
  // softDeleteAsset 가 다시 검사하므로, 권한 없는 자산은 건너뛴다(스토리 삭제는 이미 성공).
  if (input.deleteAssets && prismaMedia) {
    const links = await prisma.storyAsset.findMany({
      where: { entryId: input.id },
      select: { assetId: true },
    })
    for (const l of links) {
      try {
        await softDeleteAsset(
          { assetId: l.assetId, familyId: input.familyId, byUserId: input.byUserId },
          prisma,
          prismaMedia,
          publisher,
        )
      } catch {
        // 권한 없음·이미 삭제됨 등은 무시.
      }
    }
  }
}
