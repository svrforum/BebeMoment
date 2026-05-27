import { AppHeader } from '@/components/shell/app-header'
import { prismaPublic } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { NOTIFICATION_CATEGORIES } from '@bebe/core'
import { z } from 'zod'
import { NotificationsForm } from './notifications-form'

const BoolStringSchema = z.string()

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  return value === 'true'
}

export default async function NotificationsSettingsPage() {
  const [
    masterRaw,
    vapidPublic,
    fcmEnabledRaw,
    fcmServiceAccount,
    fcmClientConfig,
    ...categoryRaw
  ] = await Promise.all([
    getSetting('push.enabled', BoolStringSchema, 'true', prismaPublic),
    getSetting('push.vapid_public', z.string().nullable(), null, prismaPublic),
    getSetting('push.fcm.enabled', BoolStringSchema, 'false', prismaPublic),
    getSetting('push.fcm_service_account', z.string().nullable(), null, prismaPublic),
    getSetting('push.fcm_client_config', z.string().nullable(), null, prismaPublic),
    ...NOTIFICATION_CATEGORIES.map((cat) =>
      getSetting(`push.categories.${cat}.enabled`, BoolStringSchema, 'true', prismaPublic),
    ),
  ])

  const categories = NOTIFICATION_CATEGORIES.map((category, i) => ({
    category,
    enabled: parseBool(categoryRaw[i] ?? null, true),
  }))

  const vapidPublicPrefix = vapidPublic ? vapidPublic.slice(0, 12) : null

  return (
    <>
      <AppHeader title="알림" subtitle="푸시 알림 설정" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <NotificationsForm
          master={parseBool(masterRaw, true)}
          categories={categories}
          vapidPublicPrefix={vapidPublicPrefix}
          fcmEnabled={parseBool(fcmEnabledRaw, false)}
          fcmConfigured={Boolean(fcmServiceAccount && fcmServiceAccount.length > 0)}
          fcmClientConfigured={Boolean(fcmClientConfig && fcmClientConfig.length > 0)}
        />
      </div>
    </>
  )
}
