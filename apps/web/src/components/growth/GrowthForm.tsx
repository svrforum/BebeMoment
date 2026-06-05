'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { formatLastValue } from '@/lib/growth-format'

type Defaults = {
  measuredAt?: string
  heightCm?: number | null
  weightKg?: number | null
  headCm?: number | null
  note?: string | null
}

type LastRecord = {
  heightCm: number | null
  weightKg: number | null
  headCm: number | null
  measuredAt: Date
}

export function GrowthForm({
  action,
  defaults,
  submitLabel,
  lastRecord,
}: {
  action: (fd: FormData) => void
  defaults?: Defaults
  submitLabel?: string
  lastRecord?: LastRecord | null
}) {
  const t = useTranslations('misc')
  const d = defaults ?? {}
  const label = submitLabel ?? t('growth.save')
  const today = new Date().toISOString().slice(0, 10)

  const [height, setHeight] = useState(d.heightCm != null ? String(d.heightCm) : '')
  const [weight, setWeight] = useState(d.weightKg != null ? String(d.weightKg) : '')
  const [head, setHead] = useState(d.headCm != null ? String(d.headCm) : '')
  const [showHead, setShowHead] = useState(d.headCm != null)

  const hasAny = height.trim() !== '' || weight.trim() !== '' || head.trim() !== ''

  const heightHint = lastRecord
    ? formatLastValue(lastRecord.heightCm, lastRecord.measuredAt, 'cm')
    : null
  const weightHint = lastRecord
    ? formatLastValue(lastRecord.weightKg, lastRecord.measuredAt, 'kg')
    : null
  const headHint = lastRecord
    ? formatLastValue(lastRecord.headCm, lastRecord.measuredAt, 'cm')
    : null

  return (
    <form action={action} className="space-y-4">
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

      {!showHead && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowHead(true)}>
          {t('growth.addHead')}
        </Button>
      )}
      <div className={showHead ? '' : 'hidden'}>
        <Label htmlFor="headCm">{t('growth.headCircumferenceCm')}</Label>
        <Input
          id="headCm"
          name="headCm"
          type="number"
          step="0.1"
          min="0"
          max="80"
          inputMode="decimal"
          value={head}
          onChange={(e) => setHead(e.target.value)}
        />
        {headHint && (
          <p className="mt-1.5 text-xs text-base-400">
            {t('growth.lastRecordPrefix')} · {headHint}
          </p>
        )}
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
