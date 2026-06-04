'use client'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ShareSheet } from './share-sheet'

export function StoryShareButton({
  storyId,
  title,
  className,
}: {
  storyId: string
  title?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('social')
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('share.share')}
        className={className}
      >
        <Share2 size={13} strokeWidth={2.2} />
        <span>{t('share.share')}</span>
      </button>
      <ShareSheet
        target={{ kind: 'story', storyId }}
        title={title}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
