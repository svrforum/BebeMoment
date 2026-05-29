'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { Baby } from '@bebe/db-public'
import { Camera, ImagePlus, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/pagination'
import { AssetPickerSheet, type PickerAsset } from './AssetPickerSheet'
import { MOODS, type Mood, isMood } from './mood'

const MOOD_ORDER: Mood[] = ['happy', 'grateful', 'tired', 'sad', 'proud', 'calm']
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatChipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const mm = m[2]
  const dd = m[3]
  if (!mm || !dd) return iso
  const d = new Date(`${iso}T00:00:00`)
  const wd = DAYS[d.getDay()] ?? ''
  return `${Number(mm)}월 ${Number(dd)}일 (${wd})`
}

export function DiaryForm({
  action,
  babies,
  availableAssets,
  defaults,
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
  const today = new Date().toISOString().slice(0, 10)
  const [babyId, setBabyId] = useState(defaults?.babyId ?? '')
  const [entryDate, setEntryDate] = useState(defaults?.entryDate ?? today)
  const [title, setTitle] = useState(defaults?.title ?? '')
  const [body, setBody] = useState(defaults?.body ?? '')
  const [mood, setMood] = useState<Mood | ''>(
    isMood(defaults?.mood ?? null) ? (defaults?.mood as Mood) : '',
  )
  const [assetIds, setAssetIds] = useState<string[]>(defaults?.assetIds ?? [])

  const selectedBaby = useMemo(() => babies.find((b) => b.id === babyId) ?? null, [babies, babyId])
  const initial = selectedBaby?.name?.charAt(0) ?? '·'
  const assetById = useMemo(() => {
    const m = new Map<string, PickerAsset>()
    for (const a of availableAssets) m.set(a.id, a)
    return m
  }, [availableAssets])
  const selectedAssets = useMemo(
    () => assetIds.map((id) => assetById.get(id)).filter((x): x is PickerAsset => Boolean(x)),
    [assetIds, assetById],
  )

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="babyId" value={babyId} />
      <input type="hidden" name="entryDate" value={entryDate} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="mood" value={mood} />
      <input type="hidden" name="assetIds" value={JSON.stringify(assetIds)} />

      <article className="overflow-hidden rounded-3xl border border-base-200 bg-base-0 shadow-card dark:border-base-800 dark:bg-base-900">
        <header className="flex items-center gap-3 px-4 py-3">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-point-500/25 to-point-600/10 text-[15px] font-bold tracking-tight text-point-600 dark:from-point-500/30 dark:to-point-600/15 dark:text-point-300"
          >
            {initial}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label className="sr-only" htmlFor="diary-baby">
              대상
            </label>
            <div className="relative">
              <select
                id="diary-baby"
                value={babyId}
                onChange={(e) => setBabyId(e.target.value)}
                className="appearance-none rounded-full bg-base-100 px-3 py-1 pr-7 text-[13px] font-semibold text-base-800 outline-none focus:ring-2 focus:ring-point-500 dark:bg-base-800 dark:text-base-100"
              >
                <option value="">가족 전체</option>
                {babies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-base-500"
              >
                ▾
              </span>
            </div>
            <span aria-hidden className="text-[12px] text-base-400">
              ·
            </span>
            <DateChip value={entryDate} onChange={setEntryDate} />
          </div>
        </header>

        {selectedAssets.length > 0 && (
          <PhotoCarousel
            assets={selectedAssets}
            available={availableAssets}
            assetIds={assetIds}
            onChange={setAssetIds}
          />
        )}

        <div className="space-y-2 px-4 pt-3 pb-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="제목 (선택)"
            className="w-full border-0 bg-transparent p-0 text-[18px] font-semibold leading-tight tracking-tight text-base-900 outline-none placeholder:font-medium placeholder:text-base-400 dark:text-base-50"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={6}
            maxLength={20000}
            placeholder="오늘 어떤 이야기가 있었어요?"
            className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.65] text-base-800 outline-none placeholder:text-base-400 dark:text-base-200"
          />
        </div>

        <div className="border-t border-base-100 py-2 dark:border-base-800/70">
          <div
            className="flex gap-1.5 overflow-x-auto px-3 py-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {MOOD_ORDER.map((key) => {
              const m = MOODS[key]
              const active = mood === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMood(active ? '' : key)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition active:scale-95 ${
                    active
                      ? `${m.chip} ring-2 ring-point-500/40`
                      : 'bg-base-100 text-base-600 hover:bg-base-200 dark:bg-base-800 dark:text-base-300 dark:hover:bg-base-700'
                  }`}
                >
                  <span aria-hidden className="text-[13px] leading-none">
                    {m.emoji}
                  </span>
                  <span>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-base-100 px-4 py-2.5 dark:border-base-800/70">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-base-700 dark:text-base-200">
            <Camera size={15} strokeWidth={2.2} className="text-base-500" />
            {assetIds.length > 0 ? `사진 ${assetIds.length}장` : '사진 없음'}
          </span>
          <AssetPickerSheet
            available={availableAssets}
            initialSelected={assetIds}
            onChange={setAssetIds}
            triggerLabel={assetIds.length > 0 ? '사진 편집' : '사진 추가'}
            triggerClassName="inline-flex h-8 items-center gap-1 rounded-full bg-point-500/10 px-3 text-[12px] font-semibold text-point-600 transition active:scale-95 hover:bg-point-500/20 dark:bg-point-500/15 dark:text-point-300"
            triggerIcon={<ImagePlus size={13} strokeWidth={2.2} />}
          />
        </div>
      </article>
    </form>
  )
}

function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center rounded-full bg-base-100 px-3 py-1 text-[12px] font-medium text-base-700 hover:bg-base-200 dark:bg-base-800 dark:text-base-200 dark:hover:bg-base-700">
      <span>{formatChipDate(value)}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value || value)}
        required
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="날짜"
      />
    </label>
  )
}

function PhotoCarousel({
  assets,
  available,
  assetIds,
  onChange,
}: {
  assets: PickerAsset[]
  available: PickerAsset[]
  assetIds: string[]
  onChange: (next: string[]) => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  return (
    <div className="relative bg-base-100 dark:bg-base-950">
      <Swiper
        modules={[Pagination]}
        pagination={assets.length > 1 ? { clickable: true } : false}
        spaceBetween={0}
        slidesPerView={1}
        onSlideChange={(s) => setActiveIdx(s.activeIndex)}
        className="diary-carousel aspect-square w-full"
      >
        {assets.map((a) => {
          const trio = pickDisplayTrio(a.urls)
          const fallbackUrl = pickDisplayUrl(a.urls)
          if (!trio && !fallbackUrl) return null
          return (
            <SwiperSlide
              key={a.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <PictureImage
                trio={trio}
                fallbackUrl={fallbackUrl}
                alt=""
                dominantColor={a.urls?.dominantColor ?? null}
                blurhash={pickBlurhash(a.urls)}
                className="aspect-square w-full"
                objectFit="cover"
                loading="eager"
              />
            </SwiperSlide>
          )
        })}
      </Swiper>
      {assets.length > 1 && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {activeIdx + 1}/{assets.length}
        </span>
      )}
      <div className="absolute right-2.5 bottom-2.5 z-10">
        <AssetPickerSheet
          available={available}
          initialSelected={assetIds}
          onChange={onChange}
          triggerLabel="편집"
          triggerClassName="inline-flex h-8 items-center gap-1 rounded-full bg-black/55 px-3 text-[12px] font-semibold text-white backdrop-blur-sm hover:bg-black/65 transition active:scale-95"
          triggerIcon={<Pencil size={12} strokeWidth={2.4} />}
        />
      </div>
    </div>
  )
}
