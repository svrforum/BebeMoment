'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { FolderPlus } from 'lucide-react'
import { useState } from 'react'

export function StoryAlbumButton({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
      >
        <FolderPlus size={13} strokeWidth={2.2} />
        <span>앨범에 추가</span>
      </button>
      <AlbumPicker open={open} onOpenChange={setOpen} entryId={entryId} />
    </>
  )
}
