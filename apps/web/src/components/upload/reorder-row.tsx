'use client'
import { Reorder } from 'framer-motion'
import type { ReactNode } from 'react'

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
  return (
    <Reorder.Group
      axis="x"
      values={keys}
      onReorder={onReorder}
      as="div"
      className={`flex gap-2 overflow-x-auto pb-1 ${className ?? ''}`}
    >
      {keys.map((key, i) => (
        <Reorder.Item
          key={key}
          value={key}
          as="div"
          className="relative shrink-0 cursor-grab touch-pan-y select-none active:cursor-grabbing"
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
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}
