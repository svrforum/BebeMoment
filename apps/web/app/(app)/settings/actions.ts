'use server'
import type { ActionResult } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { updateDisplayName } from '@/server/user/update-display-name'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const NameSchema = z.object({ displayName: z.string().min(1).max(60) })

export async function setDisplayName(input: {
  displayName: string
}): Promise<ActionResult<{ displayName: string }>> {
  return withActionLog('settings.setDisplayName', async () => {
    const { session } = await getAuth()
    if (!session) throw actionReject(401, 'errors.unauthorized')
    const { displayName } = NameSchema.parse(input)
    const result = await updateDisplayName(session.userId, displayName, prismaPublic)
    revalidatePath('/settings')
    return result
  })
}
