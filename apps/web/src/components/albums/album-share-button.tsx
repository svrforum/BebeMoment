'use client'
import { ShareSheet } from '@/components/detail/share-sheet'
import { Share2 } from 'lucide-react'
import { useState } from 'react'

export function AlbumShareButton({ albumId, albumName }: { albumId: string; albumName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="공유"
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
      >
        <Share2 size={18} />
      </button>
      <ShareSheet
        target={{ kind: 'album', albumId }}
        title={albumName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
