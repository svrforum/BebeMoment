'use client'
import 'react-image-crop/dist/ReactCrop.css'
import { cn } from '@/lib/cn'
import { applyFilterJpeg, getCroppedJpeg, rotateJpeg90 } from '@/lib/crop-image'
import { reinjectExif } from '@/lib/exif-reinject'
import { Check, RotateCw, Sun, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { centerCrop, type Crop, makeAspectCrop, type PixelCrop } from 'react-image-crop'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

type AspectMode = 'free' | 'square' | 'landscape' | 'portrait'
const ASPECT_PRESETS: { mode: AspectMode; label: string; aspect: number | undefined }[] = [
  { mode: 'free', label: '자유', aspect: undefined },
  { mode: 'square', label: '1:1', aspect: 1 },
  { mode: 'landscape', label: '4:3', aspect: 4 / 3 },
  { mode: 'portrait', label: '3:4', aspect: 3 / 4 },
]

export function UploadEditor({
  fileId,
  originalDataUrl,
  onApply,
  onClose,
}: {
  fileId: string
  originalDataUrl: string
  onApply: (id: string, blob: Blob) => void
  onClose: () => void
}) {
  // 회전은 작업본에 baked — react-image-crop 좌표를 단순하게 유지.
  const [working, setWorking] = useState(originalDataUrl)
  const [crop, setCrop] = useState<Crop>()
  const [completed, setCompleted] = useState<PixelCrop | null>(null)
  const [aspectMode, setAspectMode] = useState<AspectMode>('free')
  const [busy, setBusy] = useState(false)
  // 밝기: -100..+100, 0 = 변화 없음. CSS filter 의 brightness(1±n/100) 로 매핑.
  // 미리보기는 <img> 의 CSS filter 로 실시간, 적용 시 canvas 의 ctx.filter 로 baked.
  const [brightness, setBrightness] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)

  const aspect = ASPECT_PRESETS.find((p) => p.mode === aspectMode)?.aspect
  const filterCss = brightness !== 0 ? `brightness(${1 + brightness / 100})` : undefined

  const rotate = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const rotated = await rotateJpeg90(working)
      setWorking(rotated)
      setCrop(undefined)
      setCompleted(null)
    } finally {
      setBusy(false)
    }
  }, [working, busy])

  /** 표시된 이미지 영역(displayed px) 기준으로 aspect 비율의 최대 크기 중앙 정렬 크롭을
   *  만들어 setCrop/setCompleted 한다. img 가 아직 안 떴으면 false. */
  const applyAspectCrop = useCallback((targetAspect: number): boolean => {
    const img = imgRef.current
    if (!img || !img.width || !img.height) return false
    // 90% 폭으로 시작하는 aspect crop 을 만들어 이미지 중앙에 배치.
    const initial = makeAspectCrop({ unit: '%', width: 90 }, targetAspect, img.width, img.height)
    const centered = centerCrop(initial, img.width, img.height)
    setCrop(centered)
    // makeAspectCrop 은 %, completed 는 px — 표시 px 로 환산.
    setCompleted({
      unit: 'px',
      x: (centered.x / 100) * img.width,
      y: (centered.y / 100) * img.height,
      width: (centered.width / 100) * img.width,
      height: (centered.height / 100) * img.height,
    })
    return true
  }, [])

  const pickAspect = useCallback(
    (mode: AspectMode) => {
      setAspectMode(mode)
      const preset = ASPECT_PRESETS.find((p) => p.mode === mode)
      if (!preset?.aspect) {
        // '자유' — 기존 선택 비움.
        setCrop(undefined)
        setCompleted(null)
        return
      }
      // 비율 프리셋을 누르면 즉시 중앙에 그 비율의 크롭 박스가 나타난다.
      // 이미지가 아직 로드 전이면 onImageLoaded 가 fallback 으로 처리.
      applyAspectCrop(preset.aspect)
    },
    [applyAspectCrop],
  )

  const onImageLoaded = useCallback(() => {
    // 사용자가 이미지 로드 전에 비율 프리셋을 눌렀다면 이제야 크롭 박스를 만들 수 있다.
    if (aspect !== undefined && crop === undefined) {
      applyAspectCrop(aspect)
    }
  }, [aspect, crop, applyAspectCrop])

  const apply = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const img = imgRef.current
      let edited: string
      if (img && completed && completed.width > 0 && completed.height > 0) {
        const scaleX = img.naturalWidth / img.width
        const scaleY = img.naturalHeight / img.height
        edited = await getCroppedJpeg(
          working,
          {
            x: completed.x * scaleX,
            y: completed.y * scaleY,
            width: completed.width * scaleX,
            height: completed.height * scaleY,
          },
          filterCss ? { filter: filterCss } : {},
        )
      } else if (filterCss) {
        // 크롭은 없고 밝기만 조정한 경우 — 전체 이미지에 필터만 baked.
        edited = await applyFilterJpeg(working, filterCss)
      } else {
        // 크롭·필터 모두 없으면 (회전만 했거나 그대로) 작업본을 그대로 사용.
        edited = working
      }
      const withExif = reinjectExif(originalDataUrl, edited)
      const blob = await dataUrlToBlob(withExif)
      onApply(fileId, blob)
      onClose()
    } finally {
      setBusy(false)
    }
  }, [busy, completed, working, originalDataUrl, fileId, onApply, onClose, filterCss])

  // Portal to <body>: the editor is opened from inside the upload sheet (a
  // vaul drawer), and vaul uses a CSS transform for its drag animation — a
  // transformed ancestor becomes the containing block for `position: fixed`,
  // which trapped the editor inside the bottom sheet (cramped, cut off).
  // Rendering at <body> makes `fixed inset-0` truly full-screen.
  if (typeof document === 'undefined') return null

  // height: 100dvh (동적 뷰포트) + safe-area 인셋 — 모바일 브라우저 주소창/시스템
  // 내비게이션 바에 상·하단 버튼이 가려지던 문제를 막는다. 이미지는 flex-1
  // min-h-0 로 남는 공간만 차지(object-contain)해 버튼을 절대 밀어내지 않는다.
  return createPortal(
    <div
      // pointer-events-auto 필수: 편집기를 연 업로드 시트(vaul)는 modal 이라
      // body 에 pointer-events:none 를 건다. body 직속으로 포털된 편집기는 그걸
      // 상속해 버튼이 보여도 클릭이 시트 오버레이로 새어나간다 — 여기서 되살린다.
      className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-black pointer-events-auto"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between p-4 text-white">
        <button type="button" onClick={onClose} aria-label="취소" className="p-2">
          <X size={22} />
        </button>
        <span className="text-sm font-medium">사진 편집</span>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          aria-label="적용"
          className="p-2 text-point-400 disabled:opacity-50"
        >
          <Check size={22} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
        <ReactCrop
          {...(crop ? { crop } : {})}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompleted(c)}
          {...(aspect !== undefined ? { aspect } : {})}
          keepSelection
          className="max-h-full"
        >
          {/* biome-ignore lint/performance/noImgElement: 편집 캔버스 소스는 로컬 blob dataURL — next/image 부적합 */}
          <img
            ref={imgRef}
            src={working}
            alt=""
            onLoad={onImageLoaded}
            className="max-h-full max-w-full object-contain"
            style={filterCss ? { filter: filterCss } : undefined}
          />
        </ReactCrop>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 px-4 pt-2">
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.mode}
            type="button"
            onClick={() => pickAspect(p.mode)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[13px] font-medium transition',
              aspectMode === p.mode
                ? 'bg-white text-black'
                : 'bg-white/12 text-white hover:bg-white/20',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 밝기 슬라이더 — Sun 아이콘 탭으로 0 리셋, 우측에 현재값. 다크 배경에서
          기본 <input type=range> 는 트랙·썸이 거의 안 보이므로 .editor-slider 로
          명시 스타일링 (globals.css). onInput/onChange 둘 다 매핑 — iOS Safari 의
          드래그 중간 이벤트 누락 회피. */}
      <div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-1 text-white">
        <button
          type="button"
          onClick={() => setBrightness(0)}
          aria-label="밝기 초기화"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 hover:bg-white/20"
        >
          <Sun size={18} />
        </button>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={brightness}
          onInput={(e) => setBrightness(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => setBrightness(Number(e.target.value))}
          aria-label="밝기"
          className="editor-slider flex-1"
        />
        <span className="w-10 text-right text-[12px] tabular-nums text-white/80">
          {brightness > 0 ? `+${brightness}` : brightness}
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-center p-4 text-white">
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
        >
          <RotateCw size={18} /> 회전
        </button>
      </div>
    </div>,
    document.body,
  )
}
