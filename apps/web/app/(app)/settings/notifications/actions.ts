'use server'
import type { ActionResult } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@bebe/core'

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
}

export async function setNotificationPref(
  category: string,
  enabled: boolean,
): Promise<ActionResult> {
  return withActionLog('settings.setNotificationPref', async () => {
    const { session } = await getAuth()
    if (!session) throw actionReject(401, 'errors.unauthorized')
    if (!isCategory(category)) throw actionReject(400, 'errors.notif.unknownCategory')

    await prismaPublic.notificationPref.upsert({
      where: { userId_category: { userId: session.userId, category } },
      create: { userId: session.userId, category, enabled },
      update: { enabled },
    })
  })
}
