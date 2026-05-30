import { DeliverySettingsForm } from '@/components/admin/delivery-settings-form'
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

function parseHour(value: string | null, fallback: number): number {
  const n = value ? Number(value) : Number.NaN
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
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

  const [dMode, dInterval, dHour, qEnabled, qStart, qEnd] = await Promise.all([
    getSetting('push.delivery.mode', BoolStringSchema, 'immediate', prismaPublic),
    getSetting('push.delivery.interval', BoolStringSchema, 'daily', prismaPublic),
    getSetting('push.delivery.daily_hour', BoolStringSchema, '9', prismaPublic),
    getSetting('push.quiet.enabled', BoolStringSchema, 'false', prismaPublic),
    getSetting('push.quiet.start', BoolStringSchema, '22', prismaPublic),
    getSetting('push.quiet.end', BoolStringSchema, '8', prismaPublic),
  ])
  const delivery = {
    mode: dMode === 'digest' ? ('digest' as const) : ('immediate' as const),
    interval:
      dInterval === 'hourly' || dInterval === 'every3h'
        ? (dInterval as 'hourly' | 'every3h')
        : ('daily' as const),
    dailyHour: parseHour(dHour, 9),
    quietEnabled: parseBool(qEnabled, false),
    quietStart: parseHour(qStart, 22),
    quietEnd: parseHour(qEnd, 8),
  }

  return (
    <>
      <AppHeader title="알림" subtitle="푸시 알림 설정" />
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-4">
        <NotificationsForm
          master={parseBool(masterRaw, true)}
          categories={categories}
          vapidPublicPrefix={vapidPublicPrefix}
          fcmEnabled={parseBool(fcmEnabledRaw, false)}
          fcmConfigured={Boolean(fcmServiceAccount && fcmServiceAccount.length > 0)}
          fcmClientConfigured={Boolean(fcmClientConfig && fcmClientConfig.length > 0)}
        />
        <div className="rounded-2xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
          <h2 className="mb-3 font-semibold">알림 발송 방식</h2>
          <DeliverySettingsForm initial={delivery} />
        </div>
      </div>
    </>
  )
}
