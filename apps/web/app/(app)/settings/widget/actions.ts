'use server'
import { requireActionContext } from '@/lib/action-context'
import type { ActionResult } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { removeWidgetPhoto as removePhoto, setWidgetPhotoOrder } from '@/server/widget/collection'
import { setWidgetConfig } from '@/server/widget/config'
import { revalidatePath } from 'next/cache'

export async function saveWidgetConfig(input: { source: string }): Promise<ActionResult> {
  return withActionLog('widget.saveConfig', async () => {
    const { session } = await getAuth()
    if (!session) throw actionReject(401, 'errors.unauthorized')
    await setWidgetConfig(session.userId, input, prismaPublic)
    revalidatePath('/settings/widget')
  })
}

export async function saveWidgetPhotoOrder(assetIds: string[]): Promise<ActionResult> {
  return withActionLog('widget.savePhotoOrder', async () => {
    const ctx = await requireActionContext()
    await setWidgetPhotoOrder(
      { familyId: ctx.family.id, userId: ctx.user.id, assetIds },
      prismaPublic,
    )
    revalidatePath('/settings/widget')
  })
}

export async function removeWidgetPhoto(assetId: string): Promise<ActionResult> {
  return withActionLog('widget.removePhoto', async () => {
    const ctx = await requireActionContext()
    await removePhoto({ assetId, familyId: ctx.family.id, userId: ctx.user.id }, prismaPublic)
    revalidatePath('/settings/widget')
  })
}
