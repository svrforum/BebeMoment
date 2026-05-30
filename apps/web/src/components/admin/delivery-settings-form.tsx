'use client'
import { setDeliverySettings } from '@/(app)/admin/notifications/actions'
import { useToast } from '@/lib/toast'
import { useState, useTransition } from 'react'

type Mode = 'immediate' | 'digest'
type Interval = 'hourly' | 'every3h' | 'daily'

export type DeliveryInitial = {
  mode: Mode
  interval: Interval
  dailyHour: number
  quietEnabled: boolean
  quietStart: number
  quietEnd: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function DeliverySettingsForm({ initial }: { initial: DeliveryInitial }) {
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [interval, setIntervalV] = useState<Interval>(initial.interval)
  const [dailyHour, setDailyHour] = useState(initial.dailyHour)
  const [quietEnabled, setQuietEnabled] = useState(initial.quietEnabled)
  const [quietStart, setQuietStart] = useState(initial.quietStart)
  const [quietEnd, setQuietEnd] = useState(initial.quietEnd)
  const [pending, start] = useTransition()
  const toast = useToast()

  function save(next: Partial<DeliveryInitial>) {
    const payload: DeliveryInitial = {
      mode,
      interval,
      dailyHour,
      quietEnabled,
      quietStart,
      quietEnd,
      ...next,
    }
    start(async () => {
      try {
        await setDeliverySettings(payload)
        toast({ title: '저장했어요', variant: 'success' })
      } catch {
        toast({ title: '저장하지 못했어요', variant: 'danger' })
      }
    })
  }

  const selCls =
    'rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm disabled:opacity-50 dark:border-base-800 dark:bg-base-900'

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-medium">발송 방식</div>
        <div className="flex gap-2">
          {(['immediate', 'digest'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={pending}
              onClick={() => {
                setMode(m)
                save({ mode: m })
              }}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                mode === m
                  ? 'border-point-500 bg-point-500/10 text-point-600 dark:text-point-300'
                  : 'border-base-200 text-base-600 dark:border-base-800 dark:text-base-300'
              }`}
            >
              {m === 'immediate' ? '즉시 발송' : '모아서 발송'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-base-500">
          모아서 발송하면 새 사진·소식을 묶어 한 번에 알려요(알림 피로 감소).
        </p>
      </div>

      {mode === 'digest' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-base-600 dark:text-base-300">주기</span>
          <select
            value={interval}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as Interval
              setIntervalV(v)
              save({ interval: v })
            }}
            className={selCls}
          >
            <option value="hourly">1시간마다</option>
            <option value="every3h">3시간마다</option>
            <option value="daily">하루 1회</option>
          </select>
          {interval === 'daily' && (
            <>
              <span className="text-sm text-base-600 dark:text-base-300">시각</span>
              <select
                value={dailyHour}
                disabled={pending}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setDailyHour(v)
                  save({ dailyHour: v })
                }}
                className={selCls}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}시
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      <div className="border-t border-base-100 pt-3 dark:border-base-800">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">야간 방해금지</span>
          <input
            type="checkbox"
            checked={quietEnabled}
            disabled={pending}
            onChange={(e) => {
              setQuietEnabled(e.target.checked)
              save({ quietEnabled: e.target.checked })
            }}
            className="h-5 w-5 accent-point-500"
          />
        </label>
        {quietEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-base-600 dark:text-base-300">
            <select
              value={quietStart}
              disabled={pending}
              onChange={(e) => {
                const v = Number(e.target.value)
                setQuietStart(v)
                save({ quietStart: v })
              }}
              className={selCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}시
                </option>
              ))}
            </select>
            <span>부터</span>
            <select
              value={quietEnd}
              disabled={pending}
              onChange={(e) => {
                const v = Number(e.target.value)
                setQuietEnd(v)
                save({ quietEnd: v })
              }}
              className={selCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}시
                </option>
              ))}
            </select>
            <span>까지 알림을 보내지 않아요</span>
          </div>
        )}
      </div>
    </div>
  )
}
