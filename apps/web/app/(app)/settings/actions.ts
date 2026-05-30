'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { updateDisplayName } from '@/server/user/update-display-name'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const NameSchema = z.object({ displayName: z.string().min(1).max(60) })

export async function setDisplayName(input: {
  displayName: string
}): Promise<{ displayName: string }> {
  const { session } = await getAuth()
  if (!session) throw new Error('로그인이 필요해요.')
  const { displayName } = NameSchema.parse(input)
  const result = await updateDisplayName(session.userId, displayName, prismaPublic)
  revalidatePath('/settings')
  return result
}
