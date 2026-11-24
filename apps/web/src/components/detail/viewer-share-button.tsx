'use client'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { ShareSheet, type SheetTarget } from './share-sheet'

const CHOICES = ['photo', 'story'] as const
type Choice = (typeof CHOICES)[number]

/**
 * 뷰어의 공유 버튼. 사진이 공유할 수 있는 스토리에 속하면 시트 위에서 '이 사진 / 스토리' 를
 * 고른다 — 추억·타임라인·알림에서 사진으로 바로 들어오면 스토리 화면을 거치지 않아 그 스토리를
 * 공유할 길이 없었다. 열 때마다 '이 사진'에서 시작한다(스토리가 없던 때와 같은 동작).
 */
export function ViewerShareButton({
  assetId,
  storyId,
  iconSize = 22,
  className,
}: {
  assetId: string
  /** 이 사진이 속한, 링크를 만들 수 있는 스토리. 없으면 고르는 칸도 없다. */
  storyId: string | null
  iconSize?: number
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>('photo')
  const t = useTranslations('social')
  const target = useMemo<SheetTarget>(
    () => (storyId && choice === 'story' ? { kind: 'story', storyId } : { kind: 'asset', assetId }),
    [assetId, storyId, choice],
  )
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChoice('photo')
          setOpen(true)
        }}
        aria-label={t('share.share')}
        className={className}
      >
        <Share2 size={iconSize} strokeWidth={2} />
      </button>
      <ShareSheet
        target={target}
        open={open}
        onOpenChange={setOpen}
        header={
          storyId ? (
            <div
              role="group"
              aria-label={t('share.target.label')}
              className="grid grid-cols-2 gap-1.5 rounded-2xl bg-base-100 p-1 dark:bg-base-800"
            >
              {CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={choice === c}
                  onClick={() => setChoice(c)}
                  className={`h-9 rounded-xl text-[14px] font-semibold transition-colors ${
                    choice === c
                      ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-950 dark:text-base-50'
                      : 'text-base-500'
                  }`}
                >
                  {t(`share.target.${c}`)}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
    </>
  )
}
