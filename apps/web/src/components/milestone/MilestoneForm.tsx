'use client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { MilestonePreset } from '@bebe/core'
import { useState } from 'react'
import { AssetPickerSheet, type PickerAsset } from '../journal/AssetPickerSheet'

export function MilestoneForm({
  action,
  availableAssets,
  defaults,
  preset,
  submitLabel = '저장',
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
  const [assetIds, setAssetIds] = useState<string[]>(defaults?.assetIds ?? [])

  return (
    <form action={action} className="space-y-3">
      {preset ? (
        <div>
          <Label>마일스톤</Label>
          <p className="text-sm">{preset.labelKo}</p>
          <input type="hidden" name="presetKey" value={preset.key} />
        </div>
      ) : (
        <div>
          <Label htmlFor="customLabel">마일스톤 이름</Label>
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
        <Label htmlFor="achievedAt">달성일</Label>
        <Input
          id="achievedAt"
          name="achievedAt"
          type="date"
          defaultValue={defaults?.achievedAt ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <div>
        <Label htmlFor="note">메모</Label>
        <Input
          id="note"
          name="note"
          type="text"
          defaultValue={defaults?.note ?? ''}
          maxLength={500}
        />
      </div>
      <div>
        <Label>사진</Label>
        <input type="hidden" name="assetIds" value={JSON.stringify(assetIds)} />
        <AssetPickerSheet
          available={availableAssets}
          initialSelected={assetIds}
          onChange={setAssetIds}
          triggerLabel={`사진 선택 (${assetIds.length})`}
        />
      </div>
      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
