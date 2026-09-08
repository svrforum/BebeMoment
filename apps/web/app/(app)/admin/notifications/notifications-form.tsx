'use client'
import { FirebaseSetupGuide } from '@/components/admin/firebase-setup-guide'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { type ActionResult, actionErrorText } from '@/lib/action-result'
import type { NotificationCategory } from '@bebe/core'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState, useTransition } from 'react'
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
  const tRoot = useTranslations()
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

  /** 액션을 돌리고 성공/실패 문구를 상태줄에 쓴다. 실패면 `onFail` 로 낙관 갱신을 되돌린다. */
  function run(action: () => Promise<ActionResult>, onSuccess: () => string, onFail?: () => void) {
    setStatus(null)
    startTransition(async () => {
      const r = await action()
      if (r.ok) {
        setStatus(onSuccess())
        return
      }
      onFail?.()
      setStatus(actionErrorText(tRoot, r))
    })
  }

  function onSaveClientConfig() {
    const saved = clientJson
    run(
      () => setFcmClientConfig(saved),
      () => {
        setFcmHasClient(saved.trim().length > 0)
        setClientJson('')
        return saved.trim()
          ? t('notifications.clientConfigSaved')
          : t('notifications.clientConfigDeleted')
      },
    )
  }

  function toggleFcm(next: boolean) {
    setFcmOn(next)
    run(
      () => setFcmEnabled(next),
      () => t('notifications.saved'),
      () => setFcmOn(!next),
    )
  }

  function onSaveServiceAccount() {
    const saved = saJson
    run(
      () => setFcmServiceAccount(saved),
      () => {
        setFcmHasKey(saved.trim().length > 0)
        setSaJson('')
        return saved.trim()
          ? t('notifications.serviceAccountSaved')
          : t('notifications.serviceAccountDeleted')
      },
    )
  }

  function toggleMaster(next: boolean) {
    setMasterOn(next)
    run(
      () => setPushMaster(next),
      () => t('notifications.saved'),
      () => setMasterOn(!next),
    )
  }

  function toggleCategory(category: NotificationCategory, next: boolean) {
    const apply = (enabled: boolean) =>
      setCats((prev) => prev.map((c) => (c.category === category ? { ...c, enabled } : c)))
    apply(next)
    run(
      () => setPushCategory(category, next),
      () => t('notifications.saved'),
      () => apply(!next),
    )
  }

  function onGenerate() {
    run(generateVapidKeys, () => {
      setHasKeys(true)
      setKeyPrefix(null)
      return t('notifications.keysGenerated')
    })
  }

  function onRegenerate() {
    run(regenerateVapidKeys, () => {
      setHasKeys(true)
      setKeyPrefix(null)
      setConfirmingRegen(false)
      return t('notifications.keysRegenerated')
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

          {/* 가이드·입력칸은 FCM 을 켰거나 이미 설정이 있을 때만 — 꺼져 있으면 토글만 보여
              산만함을 줄인다(기존 설정이 있으면 삭제할 수 있게 계속 노출). */}
          {(fcmOn || fcmHasKey || fcmHasClient) && (
            <>
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
                <FileButton accept=".json,application/json" onText={setSaJson}>
                  {t('notifications.uploadFile')}
                </FileButton>
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
                    <span className="text-point-500">
                      {t('notifications.clientConfigConfigured')}
                    </span>
                  ) : (
                    <span className="text-base-500">{t('notifications.clientConfigNone')}</span>
                  )}
                </div>
                <FileButton accept=".json,application/json" onText={setClientJson}>
                  {t('notifications.uploadGoogleServices')}
                </FileButton>
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
            </>
          )}
        </CardBody>
      </Card>

      {status && <p className="text-sm text-base-500 px-2">{status}</p>}
    </div>
  )
}

/** 다운로드한 JSON 파일을 골라 내용을 텍스트로 읽어 칸에 채운다(붙여넣기 대신 바로 업로드). */
function FileButton({
  accept,
  onText,
  children,
}: {
  accept: string
  onText: (text: string) => void
  children: ReactNode
}) {
  return (
    <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-xs font-medium text-base-700 transition-colors active:bg-base-200 dark:bg-base-800 dark:text-base-200">
      {children}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void f.text().then(onText)
        }}
      />
    </label>
  )
}
