'use client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Baby } from '@bebe/db-public'
import { useState } from 'react'
import { AssetPickerSheet, type PickerAsset } from './AssetPickerSheet'

const MOODS: { key: string; label: string }[] = [
  { key: '', label: '선택 안 함' },
  { key: 'happy', label: '기뻐요' },
  { key: 'grateful', label: '감사해요' },
  { key: 'tired', label: '지쳐요' },
  { key: 'sad', label: '슬퍼요' },
  { key: 'proud', label: '자랑스러워요' },
  { key: 'calm', label: '차분해요' },
]

export function JournalForm({
  action,
  babies,
  availableAssets,
  defaults,
  submitLabel = '저장',
}: {
  action: (fd: FormData) => void
  babies: Pick<Baby, 'id' | 'name'>[]
  availableAssets: PickerAsset[]
  defaults?: {
    babyId?: string | null
    entryDate?: string
    title?: string | null
    body?: string
    mood?: string | null
    assetIds?: string[]
  }
  submitLabel?: string
}) {
  const [assetIds, setAssetIds] = useState<string[]>(defaults?.assetIds ?? [])

  return (
    <form action={action} className="space-y-3">
      <div>
        <Label>대상</Label>
        <select
          name="babyId"
          className="mt-1 w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-800 dark:bg-base-900"
          defaultValue={defaults?.babyId ?? ''}
        >
          <option value="">가족 전체</option>
          {babies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="entryDate">날짜</Label>
        <Input
          id="entryDate"
          name="entryDate"
          type="date"
          defaultValue={defaults?.entryDate ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <div>
        <Label htmlFor="title">제목 (선택)</Label>
        <Input id="title" name="title" maxLength={120} defaultValue={defaults?.title ?? ''} />
      </div>
      <div>
        <Label htmlFor="body">내용</Label>
        <textarea
          id="body"
          name="body"
          required
          rows={8}
          maxLength={20000}
          defaultValue={defaults?.body ?? ''}
          className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-800 dark:bg-base-900"
        />
      </div>
      <div>
        <Label htmlFor="mood">기분 (선택)</Label>
        <select
          id="mood"
          name="mood"
          className="mt-1 w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-800 dark:bg-base-900"
          defaultValue={defaults?.mood ?? ''}
        >
          {MOODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
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
