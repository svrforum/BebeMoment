'use client'
import { DiaryCard } from '@/components/timeline/diary-card'
import { useToast } from '@/lib/toast'
import type { AssetWithUrls } from '@/server/asset/types'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Entry = JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] }

export function AlbumStoryItem({ albumId, entry }: { albumId: string; entry: Entry }) {
  const router = useRouter()
  const toast = useToast()
  const [removing, setRemoving] = useState(false)

  async function remove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (removing) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/albums/${albumId}/entries/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      toast({ title: '앨범에서 제거하지 못했어요', variant: 'danger' })
      setRemoving(false)
    }
  }

  return (
    <div className="relative">
      <DiaryCard entry={entry} />
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        aria-label="앨범에서 제거"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition active:scale-90 disabled:opacity-50"
      >
        <X size={15} strokeWidth={2.4} />
      </button>
    </div>
  )
}
