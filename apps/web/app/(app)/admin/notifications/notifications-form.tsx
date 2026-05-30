'use client'
import { FirebaseSetupGuide } from '@/components/admin/firebase-setup-guide'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import type { NotificationCategory } from '@bebe/core'
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

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  asset_upload: '새 사진/영상',
  comment_mention: '댓글·멘션',
  album_add: '앨범 추가',
  diary_growth_milestone: '스토리·성장·마일스톤',
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
        setStatus(clientJson.trim() ? '앱 설정을 저장했어요.' : '앱 설정을 삭제했어요.')
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
        setStatus('저장됨')
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
        setStatus(saJson.trim() ? '서비스 계정을 저장했어요.' : '서비스 계정을 삭제했어요.')
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
        setStatus('저장됨')
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
        setStatus('저장됨')
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
        setStatus('키가 생성됐어요. 새로고침하면 공개키 일부가 표시됩니다.')
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
        setStatus('키를 재생성하고 모든 기기의 구독을 해제했어요.')
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
              <div className="font-medium">푸시 알림 사용</div>
              <div className="text-xs text-base-500">꺼두면 어떤 알림도 발송되지 않아요.</div>
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
          <h2 className="font-semibold">카테고리별 알림</h2>
          {cats.map((c) => (
            <div key={c.category} className="flex items-center justify-between gap-4">
              <span className={masterOn ? '' : 'text-base-400'}>{CATEGORY_LABELS[c.category]}</span>
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
          <h2 className="font-semibold">VAPID 키</h2>
          {hasKeys ? (
            <div className="space-y-1">
              <div className="text-sm text-point-500">키가 설정되어 있어요.</div>
              {keyPrefix && (
                <div className="font-mono text-xs text-base-500">공개키: {keyPrefix}…</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-base-500">아직 키가 없어요. 키를 생성해 주세요.</div>
          )}

          {!hasKeys && (
            <Button onClick={onGenerate} disabled={pending}>
              키 생성
            </Button>
          )}

          {hasKeys &&
            (confirmingRegen ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">
                  재생성하면 모든 기기의 알림이 해제되어 다시 켜야 합니다. 계속할까요?
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={onRegenerate} disabled={pending}>
                    재생성 확인
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingRegen(false)}
                    disabled={pending}
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setConfirmingRegen(true)}
                disabled={pending}
              >
                키 재생성
              </Button>
            ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">안드로이드 앱 푸시 (FCM)</h2>
              <div className="text-xs text-base-500">
                안드로이드 앱 사용자에게 푸시를 보내려면 Firebase 서비스 계정이 필요해요.
              </div>
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
                <span className="text-point-500">서비스 계정이 설정되어 있어요.</span>
              ) : (
                <span className="text-base-500">아직 서비스 계정이 없어요.</span>
              )}
            </div>
            <textarea
              value={saJson}
              onChange={(e) => setSaJson(e.target.value)}
              placeholder='서비스 계정 JSON 붙여넣기 (예: { "project_id": ..., "client_email": ..., "private_key": ... })'
              rows={4}
              className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 font-mono text-xs dark:border-base-800 dark:bg-base-900"
            />
            <Button onClick={onSaveServiceAccount} disabled={pending}>
              {saJson.trim() ? '서비스 계정 저장' : '서비스 계정 삭제'}
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-base-100 pt-3 dark:border-base-800">
            <div className="text-sm font-medium">앱 Firebase 설정 (공개 키)</div>
            <div className="text-xs text-base-500">
              안드로이드 앱이 기기 토큰을 발급받을 때 사용하는 공개 설정이에요. (firebaseConfig:
              apiKey·appId·projectId·messagingSenderId)
            </div>
            <div className="text-sm">
              {fcmHasClient ? (
                <span className="text-point-500">앱 설정이 등록되어 있어요.</span>
              ) : (
                <span className="text-base-500">아직 앱 설정이 없어요.</span>
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
              {clientJson.trim() ? '앱 설정 저장' : '앱 설정 삭제'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {status && <p className="text-sm text-base-500 px-2">{status}</p>}
    </div>
  )
}
