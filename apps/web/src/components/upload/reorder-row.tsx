'use client'
import { Reorder } from 'framer-motion'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import { moveKey } from './reorder-move'

/**
 * 가로 드래그 재정렬 스트립. OS 사진 선택창은 "탭한 순서"가 아니라 파일명·날짜 순으로
 * 파일을 돌려줘서, 스토리 사진 순서를 사용자가 의도한 대로 통제하려면 직접 재정렬이
 * 필요하다. 첫 칸(index 0)이 대표(썸네일), 이후 2·3·4… 순번 배지를 단다.
 *
 * 값은 **안정적인 문자열 key** 로 다룬다(파일/자산 객체는 매 렌더 새로 만들어져 framer
 * Reorder 의 값 동일성이 깨지므로). 소비자는 key→데이터 lookup 으로 렌더한다.
 *
 * framer-motion Reorder 는 1D 라 가로 스트립(axis="x")으로 둔다 — 래핑 그리드 재정렬은
 * 불안정. axis="x" 면 framer 가 touch-action: pan-y 를 걸어 세로 페이지 스크롤은 유지된다.
 *
 * ⚠️ 드래그만으로는 **화면에 보이는 범위 안에서만** 옮길 수 있다. 드래그 중에는 스트립을
 * 가로로 스크롤할 수 없어서, 사진이 많아지면 뒤쪽 사진을 대표(1번)로 가져오는 것이 아예
 * 불가능했다. 그래서 '순서 이동' 모드를 함께 둔다 — 하나를 집고, 스트립을 자유롭게
 * 스크롤한 뒤, 놓을 자리를 탭한다.
 */
export function ReorderRow({
  keys,
  onReorder,
  renderItem,
  coverLabel,
  className,
}: {
  keys: string[]
  onReorder: (keys: string[]) => void
  renderItem: (key: string, index: number) => ReactNode
  coverLabel: string
  className?: string
}) {
  const t = useTranslations('upload')
  // 이동 모드에서 집어 든 key. null 이면 평소(드래그) 모드.
  const [moving, setMoving] = useState<string | null>(null)
  const [moveMode, setMoveMode] = useState(false)

  function place(target: string) {
    if (!moving) {
      setMoving(target)
      return
    }
    if (moving !== target) onReorder(moveKey(keys, moving, target))
    setMoving(null)
  }

  function exitMoveMode() {
    setMoving(null)
    setMoveMode(false)
  }

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-base-400">
          {moveMode
            ? moving
              ? t('moveMode.pickTarget')
              : t('moveMode.pickSource')
            : t('moveMode.hint')}
        </p>
        {keys.length > 1 && (
          <button
            type="button"
            onClick={() => (moveMode ? exitMoveMode() : setMoveMode(true))}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-base-500 transition-colors hover:bg-base-100 dark:hover:bg-base-800"
          >
            {moveMode ? <Check size={12} /> : <ArrowLeftRight size={12} />}
            {moveMode ? t('moveMode.done') : t('moveMode.start')}
          </button>
        )}
      </div>

      <Reorder.Group
        axis="x"
        values={keys}
        onReorder={onReorder}
        as="div"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {keys.map((key, i) => (
          <Reorder.Item
            key={key}
            value={key}
            as="div"
            // 이동 모드에서는 드래그를 끈다 — 켜두면 스트립을 스크롤하려는 손짓이
            // 드래그로 잡혀 스크롤 자체가 안 된다(그게 원래 문제였다).
            drag={moveMode ? false : 'x'}
            className={`relative shrink-0 select-none ${
              moveMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
            } ${moving === key ? 'opacity-60 ring-2 ring-point-500 rounded-xl' : ''}`}
            whileDrag={{ scale: 1.06, zIndex: 20 }}
          >
            {renderItem(key, i)}
            <span
              className={`pointer-events-none absolute left-1 top-1 z-[2] rounded-full px-1.5 py-px text-[10px] font-bold leading-tight shadow-sm ${
                i === 0 ? 'bg-point-500 text-white' : 'bg-black/65 text-white'
              }`}
            >
              {i === 0 ? coverLabel : i + 1}
            </span>
            {moveMode && (
              // 썸네일 위에 덮는 투명 버튼 — 이동 모드에서는 확대·삭제·편집 버튼이 아니라
              // "집기/놓기"만 받아야 한다.
              <button
                type="button"
                onClick={() => place(key)}
                aria-label={moving === key ? t('moveMode.cancelPick') : t('moveMode.pick')}
                className="absolute inset-0 z-[3] rounded-xl"
              />
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {moveMode && moving && (
        <button
          type="button"
          onClick={() => setMoving(null)}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-base-500"
        >
          <X size={12} />
          {t('moveMode.cancel')}
        </button>
      )}
    </div>
  )
}
