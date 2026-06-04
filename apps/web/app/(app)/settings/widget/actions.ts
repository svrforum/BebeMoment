'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { setWidgetConfig } from '@/server/widget/config'
import { revalidatePath } from 'next/cache'

export async function saveWidgetConfig(input: {
  source: string
  pinnedAssetId: string | null
}): Promise<{ ok: boolean }> {
  const { session } = await getAuth()
  if (!session) return { ok: false }
  await setWidgetConfig(session.userId, input, prismaPublic)
  revalidatePath('/settings/widget')
  return { ok: true }
}
