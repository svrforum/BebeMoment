'use client'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { type FormActionState, actionErrorText } from '@/lib/action-result'
import { formatLastValue } from '@/lib/growth-format'
import { canSubmitGrowth } from '@/lib/growth-submittable'

type Defaults = {
  measuredAt?: string
  heightCm?: number | null
  weightKg?: number | null
  note?: string | null
}

type LastRecord = {
  heightCm: number | null
  weightKg: number | null
  measuredAt: Date
}

export function GrowthForm({
  action,
  defaults,
  submitLabel,
  lastRecord,
  hasHiddenMeasurement = false,
}: {
  action: (prev: FormActionState, fd: FormData) => Promise<FormActionState>
  defaults?: Defaults
  submitLabel?: string
  lastRecord?: LastRecord | null
  /** 이 폼이 더는 보여주지 않는 측정값(머리둘레)을 가진 옛 기록인지. 수정 잠김 방지용. */
  hasHiddenMeasurement?: boolean
}) {
  const t = useTranslations('misc')
  const tRoot = useTranslations()
  const [failure, formAction] = useActionState(action, null)
  const d = defaults ?? {}
  const label = submitLabel ?? t('growth.save')
  const today = new Date().toISOString().slice(0, 10)

  const [height, setHeight] = useState(d.heightCm != null ? String(d.heightCm) : '')
  const [weight, setWeight] = useState(d.weightKg != null ? String(d.weightKg) : '')

  const hasAny = canSubmitGrowth({ height, weight, hasHiddenMeasurement })

  const heightHint = lastRecord
    ? formatLastValue(lastRecord.heightCm, lastRecord.measuredAt, 'cm')
    : null
  const weightHint = lastRecord
    ? formatLastValue(lastRecord.weightKg, lastRecord.measuredAt, 'kg')
    : null

  return (
    <form action={formAction} className="space-y-4">
      {failure && (
        <p className="text-sm text-danger" role="alert">
          {actionErrorText(tRoot, failure)}
        </p>
      )}
      <div>
        <Label htmlFor="measuredAt">{t('growth.measuredAt')}</Label>
        <Input
          id="measuredAt"
          name="measuredAt"
          type="date"
          max={today}
          defaultValue={d.measuredAt ?? today}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="heightCm">{t('growth.heightCm')}</Label>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            step="0.1"
            min="0"
            max="200"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
          {heightHint && (
            <p className="mt-1.5 text-xs text-base-400">
              {t('growth.lastRecordPrefix')} · {heightHint}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="weightKg">{t('growth.weightKg')}</Label>
          <Input
            id="weightKg"
            name="weightKg"
            type="number"
            step="0.01"
            min="0"
            max="50"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          {weightHint && (
            <p className="mt-1.5 text-xs text-base-400">
              {t('growth.lastRecordPrefix')} · {weightHint}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="note">{t('growth.noteOptional')}</Label>
        <Input id="note" name="note" type="text" defaultValue={d.note ?? ''} maxLength={500} />
      </div>

      {!hasAny && <p className="text-xs text-base-400">{t('growth.atLeastOne')}</p>}

      <Button type="submit" variant="primary" className="w-full" disabled={!hasAny}>
        {label}
      </Button>
    </form>
  )
}
