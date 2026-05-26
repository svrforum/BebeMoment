'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@bebe/core'

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
}

export async function setNotificationPref(category: string, enabled: boolean): Promise<void> {
  const { session } = await getAuth()
  if (!session) throw new Error('로그인이 필요해요')
  if (!isCategory(category)) throw new Error('알 수 없는 알림 항목이에요')

  await prismaPublic.notificationPref.upsert({
    where: { userId_category: { userId: session.userId, category } },
    create: { userId: session.userId, category, enabled },
    update: { enabled },
  })
}
