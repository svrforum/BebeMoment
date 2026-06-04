import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { useTranslations } from 'next-intl'

export function GrowthForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (fd: FormData) => void
  defaults?: {
    measuredAt?: string
    heightCm?: number | null
    weightKg?: number | null
    headCm?: number | null
    note?: string | null
  }
  submitLabel?: string
}) {
  const t = useTranslations('misc')
  const d = defaults ?? {}
  const label = submitLabel ?? t('growth.save')
  return (
    <form action={action} className="space-y-3">
      <div>
        <Label htmlFor="measuredAt">{t('growth.measuredAt')}</Label>
        <Input
          id="measuredAt"
          name="measuredAt"
          type="date"
          defaultValue={d.measuredAt ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="heightCm">{t('growth.heightCm')}</Label>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            step="0.1"
            min="0"
            max="200"
            defaultValue={d.heightCm ?? ''}
          />
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
            defaultValue={d.weightKg ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="headCm">{t('growth.headCm')}</Label>
          <Input
            id="headCm"
            name="headCm"
            type="number"
            step="0.1"
            min="0"
            max="80"
            defaultValue={d.headCm ?? ''}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="note">{t('growth.noteOptional')}</Label>
        <Input id="note" name="note" type="text" defaultValue={d.note ?? ''} maxLength={500} />
      </div>
      <Button type="submit" className="w-full">
        {label}
      </Button>
    </form>
  )
}
