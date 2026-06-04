'use client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { MilestonePreset } from '@bebe/core'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { AssetPickerSheet, type PickerAsset } from '../story/AssetPickerSheet'

export function MilestoneForm({
  action,
  availableAssets,
  defaults,
  preset,
  submitLabel,
}: {
  action: (fd: FormData) => void
  availableAssets: PickerAsset[]
  defaults?: {
    achievedAt?: string
    note?: string | null
    assetIds?: string[]
    customLabel?: string | null
  }
  preset?: MilestonePreset
  submitLabel?: string
}) {
  const t = useTranslations('misc')
  const [assetIds, setAssetIds] = useState<string[]>(defaults?.assetIds ?? [])
  const label = submitLabel ?? t('milestone.save')

  return (
    <form action={action} className="space-y-3">
      {preset ? (
        <div>
          <Label>{t('milestone.label')}</Label>
          <p className="text-sm">{preset.labelKo}</p>
          <input type="hidden" name="presetKey" value={preset.key} />
        </div>
      ) : (
        <div>
          <Label htmlFor="customLabel">{t('milestone.customLabel')}</Label>
          <Input
            id="customLabel"
            name="customLabel"
            required
            maxLength={40}
            defaultValue={defaults?.customLabel ?? ''}
          />
        </div>
      )}
      <div>
        <Label htmlFor="achievedAt">{t('milestone.achievedAt')}</Label>
        <Input
          id="achievedAt"
          name="achievedAt"
          type="date"
          defaultValue={defaults?.achievedAt ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <div>
        <Label htmlFor="note">{t('milestone.note')}</Label>
        <Input
          id="note"
          name="note"
          type="text"
          defaultValue={defaults?.note ?? ''}
          maxLength={500}
        />
      </div>
      <div>
        <Label>{t('milestone.photos')}</Label>
        <input type="hidden" name="assetIds" value={JSON.stringify(assetIds)} />
        <AssetPickerSheet
          available={availableAssets}
          initialSelected={assetIds}
          onChange={setAssetIds}
          triggerLabel={t('milestone.selectPhotos', { count: assetIds.length })}
        />
      </div>
      <Button type="submit" className="w-full">
        {label}
      </Button>
    </form>
  )
}
