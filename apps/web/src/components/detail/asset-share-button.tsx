'use client'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ShareSheet } from './share-sheet'

export function AssetShareButton({
  assetId,
  iconSize = 22,
  className,
}: {
  assetId: string
  iconSize?: number
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
        <Share2 size={iconSize} strokeWidth={2} />
      </button>
      <ShareSheet target={{ kind: 'asset', assetId }} open={open} onOpenChange={setOpen} />
    </>
  )
}
