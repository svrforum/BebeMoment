'use server'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { softDeleteStoryEntry } from '@/server/story/soft-delete'
import { getPublisher } from '@/server/upload/pubsub'
import { redirect } from 'next/navigation'

// 스토리 편집은 클라이언트 폼(StoryEditForm)이 PATCH /api/story/[id] 로 직접 보낸다
// (직접 업로드 흐름과 async 로 맞물려야 해서 server action 대신 fetch). 여기엔 삭제만 남음.

export async function deleteStoryAction(id: string, deletePhotos: boolean) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await softDeleteStoryEntry(
    { id, familyId: ctx.family.id, byUserId: ctx.user.id, deleteAssets: deletePhotos },
    prismaPublic,
    prismaMedia,
    getPublisher(),
  )
  redirect('/story')
}
