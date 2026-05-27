'use client'
import 'react-image-crop/dist/ReactCrop.css'
import { cn } from '@/lib/cn'
import { getCroppedJpeg, rotateJpeg90 } from '@/lib/crop-image'
import { reinjectExif } from '@/lib/exif-reinject'
import { Check, RotateCw, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'

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
  const imgRef = useRef<HTMLImageElement>(null)

  const aspect = ASPECT_PRESETS.find((p) => p.mode === aspectMode)?.aspect

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

  const pickAspect = useCallback((mode: AspectMode) => {
    setAspectMode(mode)
    // 비율을 바꾸면 기존 선택을 비워 새 비율로 다시 그리게 한다.
    setCrop(undefined)
    setCompleted(null)
  }, [])

  const apply = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const img = imgRef.current
      let edited: string
      if (img && completed && completed.width > 0 && completed.height > 0) {
        const scaleX = img.naturalWidth / img.width
        const scaleY = img.naturalHeight / img.height
        edited = await getCroppedJpeg(working, {
          x: completed.x * scaleX,
          y: completed.y * scaleY,
          width: completed.width * scaleX,
          height: completed.height * scaleY,
        })
      } else {
        // 크롭 선택이 없으면 (회전만 했거나 그대로) 작업본을 그대로 사용.
        edited = working
      }
      const withExif = reinjectExif(originalDataUrl, edited)
      const blob = await dataUrlToBlob(withExif)
      onApply(fileId, blob)
      onClose()
    } finally {
      setBusy(false)
    }
  }, [busy, completed, working, originalDataUrl, fileId, onApply, onClose])

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
          {/* biome-ignore lint/a11y/useAltText: 편집용 미리보기 이미지 */}
          <img ref={imgRef} src={working} alt="" className="max-h-full max-w-full object-contain" />
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
