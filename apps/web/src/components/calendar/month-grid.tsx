'use client'
import { Button } from '@/components/ui/button'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { DayCell } from './day-cell'

type Asset = { id: string; takenAtISO: string; urls: AssetUrls | null }

type Props = {
  initialYear: number
  initialMonth: number
  assets: Asset[]
}

function daysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const days: Date[] = []
  for (let i = 0; i < startWeekday; i++) {
    days.push(new Date(year, month, 1 - (startWeekday - i)))
  }
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1] as Date
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
  }
  return days
}

export function MonthGrid({ initialYear, initialMonth, assets }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  const days = daysInMonth(year, month)
  const byDate = new Map<string, Asset[]>()
  for (const a of assets) {
    const d = new Date(a.takenAtISO)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const list = byDate.get(key) ?? []
    list.push(a)
    byDate.set(key, list)
  }

  const prev = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }
  const next = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={prev} aria-label="이전 달">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold tabular-nums">{monthLabel}</h2>
        <Button variant="ghost" size="icon" onClick={next} aria-label="다음 달">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-base-500 mb-1">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          const dayAssets = byDate.get(key) ?? []
          return (
            <DayCell
              key={d.toISOString()}
              date={d}
              assets={dayAssets.map((a) => ({
                id: a.id,
                urls: a.urls,
              }))}
              isCurrentMonth={d.getMonth() === month}
            />
          )
        })}
      </div>
    </div>
  )
}
