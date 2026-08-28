'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { removeWidgetPhoto as removePhoto, setWidgetPhotoOrder } from '@/server/widget/collection'
import { setWidgetConfig } from '@/server/widget/config'
import { revalidatePath } from 'next/cache'

export async function saveWidgetConfig(input: { source: string }): Promise<{ ok: boolean }> {
  const { session } = await getAuth()
  if (!session) return { ok: false }
  await setWidgetConfig(session.userId, input, prismaPublic)
  revalidatePath('/settings/widget')
  return { ok: true }
}

export async function saveWidgetPhotoOrder(assetIds: string[]): Promise<{ ok: boolean }> {
  const ctx = await getContext()
  if (!ctx.user || !ctx.family) return { ok: false }
  await setWidgetPhotoOrder(
    { familyId: ctx.family.id, userId: ctx.user.id, assetIds },
    prismaPublic,
  )
  revalidatePath('/settings/widget')
  return { ok: true }
}

export async function removeWidgetPhoto(assetId: string): Promise<{ ok: boolean }> {
  const ctx = await getContext()
  if (!ctx.user || !ctx.family) return { ok: false }
  await removePhoto({ assetId, familyId: ctx.family.id, userId: ctx.user.id }, prismaPublic)
  revalidatePath('/settings/widget')
  return { ok: true }
}
