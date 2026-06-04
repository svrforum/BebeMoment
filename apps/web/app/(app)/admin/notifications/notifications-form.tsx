'use client'
import { FirebaseSetupGuide } from '@/components/admin/firebase-setup-guide'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import type { NotificationCategory } from '@bebe/core'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import {
  generateVapidKeys,
  regenerateVapidKeys,
  setFcmClientConfig,
  setFcmEnabled,
  setFcmServiceAccount,
  setPushCategory,
  setPushMaster,
} from './actions'

const CATEGORY_KEYS: Record<NotificationCategory, string> = {
  asset_upload: 'assetUpload',
  comment_mention: 'commentMention',
  album_add: 'albumAdd',
  diary_growth_milestone: 'diaryGrowthMilestone',
  memory: 'memory',
}

type Props = {
  master: boolean
  categories: { category: NotificationCategory; enabled: boolean }[]
  vapidPublicPrefix: string | null
  fcmEnabled: boolean
  fcmConfigured: boolean
  fcmClientConfigured: boolean
}

export function NotificationsForm({
  master,
  categories,
  vapidPublicPrefix,
  fcmEnabled,
  fcmConfigured,
  fcmClientConfigured,
}: Props) {
  const t = useTranslations('admin')
  const [masterOn, setMasterOn] = useState(master)
  const [cats, setCats] = useState(categories)
  const [hasKeys, setHasKeys] = useState(vapidPublicPrefix !== null)
  const [keyPrefix, setKeyPrefix] = useState(vapidPublicPrefix)
  const [confirmingRegen, setConfirmingRegen] = useState(false)
  const [fcmOn, setFcmOn] = useState(fcmEnabled)
  const [fcmHasKey, setFcmHasKey] = useState(fcmConfigured)
  const [saJson, setSaJson] = useState('')
  const [fcmHasClient, setFcmHasClient] = useState(fcmClientConfigured)
  const [clientJson, setClientJson] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSaveClientConfig() {
    setStatus(null)
    startTransition(async () => {
      try {
        await setFcmClientConfig(clientJson)
        setFcmHasClient(clientJson.trim().length > 0)
        setClientJson('')
        setStatus(
          clientJson.trim()
            ? t('notifications.clientConfigSaved')
            : t('notifications.clientConfigDeleted'),
        )
      } catch (e) {
        setStatus((e as Error).message)
      }
    })
  }

  function toggleFcm(next: boolean) {
    setFcmOn(next)
    setStatus(null)
    startTransition(async () => {
      try {
        await setFcmEnabled(next)
        setStatus(t('notifications.saved'))
      } catch (e) {
        setFcmOn(!next)
        setStatus((e as Error).message)
      }
    })
  }

  function onSaveServiceAccount() {
    setStatus(null)
    startTransition(async () => {
      try {
        await setFcmServiceAccount(saJson)
        setFcmHasKey(saJson.trim().length > 0)
        setSaJson('')
        setStatus(
          saJson.trim()
            ? t('notifications.serviceAccountSaved')
            : t('notifications.serviceAccountDeleted'),
        )
      } catch (e) {
        setStatus((e as Error).message)
      }
    })
  }

  function toggleMaster(next: boolean) {
    setMasterOn(next)
    setStatus(null)
    startTransition(async () => {
      try {
        await setPushMaster(next)
        setStatus(t('notifications.saved'))
      } catch (e) {
        setMasterOn(!next)
        setStatus((e as Error).message)
      }
    })
  }

  function toggleCategory(category: NotificationCategory, next: boolean) {
    setCats((prev) => prev.map((c) => (c.category === category ? { ...c, enabled: next } : c)))
    setStatus(null)
    startTransition(async () => {
      try {
        await setPushCategory(category, next)
        setStatus(t('notifications.saved'))
      } catch (e) {
        setCats((prev) => prev.map((c) => (c.category === category ? { ...c, enabled: !next } : c)))
        setStatus((e as Error).message)
      }
    })
  }

  function onGenerate() {
    setStatus(null)
    startTransition(async () => {
      try {
        await generateVapidKeys()
        setHasKeys(true)
        setKeyPrefix(null)
        setStatus(t('notifications.keysGenerated'))
      } catch (e) {
        setStatus((e as Error).message)
      }
    })
  }

  function onRegenerate() {
    setStatus(null)
    startTransition(async () => {
      try {
        await regenerateVapidKeys()
        setHasKeys(true)
        setKeyPrefix(null)
        setConfirmingRegen(false)
        setStatus(t('notifications.keysRegenerated'))
      } catch (e) {
        setStatus((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{t('notifications.master')}</div>
              <div className="text-xs text-base-500">{t('notifications.masterHelp')}</div>
            </div>
            <Toggle
              checked={masterOn}
              disabled={pending}
              onChange={(e) => toggleMaster(e.target.checked)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-semibold">{t('notifications.categoriesHeading')}</h2>
          {cats.map((c) => (
            <div key={c.category} className="flex items-center justify-between gap-4">
              <span className={masterOn ? '' : 'text-base-400'}>
                {t(`notifications.category.${CATEGORY_KEYS[c.category]}`)}
              </span>
              <Toggle
                checked={c.enabled}
                disabled={pending || !masterOn}
                onChange={(e) => toggleCategory(c.category, e.target.checked)}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-semibold">{t('notifications.vapidHeading')}</h2>
          {hasKeys ? (
            <div className="space-y-1">
              <div className="text-sm text-point-500">{t('notifications.vapidConfigured')}</div>
              {keyPrefix && (
                <div className="font-mono text-xs text-base-500">
                  {t('notifications.vapidPublicKey', { prefix: keyPrefix })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-base-500">{t('notifications.vapidNone')}</div>
          )}

          {!hasKeys && (
            <Button onClick={onGenerate} disabled={pending}>
              {t('notifications.generateKeys')}
            </Button>
          )}

          {hasKeys &&
            (confirmingRegen ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">{t('notifications.regenWarning')}</p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={onRegenerate} disabled={pending}>
                    {t('notifications.regenConfirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingRegen(false)}
                    disabled={pending}
                  >
                    {t('notifications.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setConfirmingRegen(true)}
                disabled={pending}
              >
                {t('notifications.regenKeys')}
              </Button>
            ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t('notifications.fcmHeading')}</h2>
              <div className="text-xs text-base-500">{t('notifications.fcmHelp')}</div>
            </div>
            <Toggle
              checked={fcmOn}
              disabled={pending}
              onChange={(e) => toggleFcm(e.target.checked)}
            />
          </div>

          <FirebaseSetupGuide />

          <div className="space-y-1.5">
            <div className="text-sm">
              {fcmHasKey ? (
                <span className="text-point-500">
                  {t('notifications.serviceAccountConfigured')}
                </span>
              ) : (
                <span className="text-base-500">{t('notifications.serviceAccountNone')}</span>
              )}
            </div>
            <textarea
              value={saJson}
              onChange={(e) => setSaJson(e.target.value)}
              placeholder={t('notifications.serviceAccountPlaceholder')}
              rows={4}
              className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 font-mono text-xs dark:border-base-800 dark:bg-base-900"
            />
            <Button onClick={onSaveServiceAccount} disabled={pending}>
              {saJson.trim()
                ? t('notifications.serviceAccountSaveBtn')
                : t('notifications.serviceAccountDeleteBtn')}
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-base-100 pt-3 dark:border-base-800">
            <div className="text-sm font-medium">{t('notifications.clientConfigHeading')}</div>
            <div className="text-xs text-base-500">{t('notifications.clientConfigHelp')}</div>
            <div className="text-sm">
              {fcmHasClient ? (
                <span className="text-point-500">{t('notifications.clientConfigConfigured')}</span>
              ) : (
                <span className="text-base-500">{t('notifications.clientConfigNone')}</span>
              )}
            </div>
            <textarea
              value={clientJson}
              onChange={(e) => setClientJson(e.target.value)}
              placeholder='{ "apiKey": ..., "appId": ..., "projectId": ..., "messagingSenderId": ... }'
              rows={4}
              className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 font-mono text-xs dark:border-base-800 dark:bg-base-900"
            />
            <Button onClick={onSaveClientConfig} disabled={pending}>
              {clientJson.trim()
                ? t('notifications.clientConfigSaveBtn')
                : t('notifications.clientConfigDeleteBtn')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {status && <p className="text-sm text-base-500 px-2">{status}</p>}
    </div>
  )
}
