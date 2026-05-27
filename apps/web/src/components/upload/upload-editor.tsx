'use client'
import { cn } from '@/lib/cn'
import { getCroppedJpeg, type PixelCrop } from '@/lib/crop-image'
import { reinjectExif } from '@/lib/exif-reinject'
import { Check, RotateCw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import Cropper, { type Area, type MediaSize } from 'react-easy-crop'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

type AspectMode = 'free' | 'square' | 'landscape' | 'portrait'
const ASPECT_PRESETS: { mode: AspectMode; label: string }[] = [
  { mode: 'free', label: '자유' },
  { mode: 'square', label: '1:1' },
  { mode: 'landscape', label: '4:3' },
  { mode: 'portrait', label: '3:4' },
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
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pixels, setPixels] = useState<PixelCrop | null>(null)
  const [busy, setBusy] = useState(false)
  const [aspectMode, setAspectMode] = useState<AspectMode>('free')
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null)

  // '자유'는 원본 비율(임의 사각형 크롭은 react-easy-crop 미지원) — 회전 보정해 가로/세로.
  const freeAspect =
    naturalAspect == null ? 1 : rotation % 180 === 0 ? naturalAspect : 1 / naturalAspect
  const aspect =
    aspectMode === 'square'
      ? 1
      : aspectMode === 'landscape'
        ? 4 / 3
        : aspectMode === 'portrait'
          ? 3 / 4
          : freeAspect

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels)
  }, [])

  const onMediaLoaded = useCallback((media: MediaSize) => {
    setNaturalAspect(media.naturalWidth / media.naturalHeight)
  }, [])

  const apply = useCallback(async () => {
    if (!pixels || busy) return
    setBusy(true)
    try {
      const editedDataUrl = await getCroppedJpeg(originalDataUrl, pixels, rotation)
      const withExif = reinjectExif(originalDataUrl, editedDataUrl)
      const blob = await dataUrlToBlob(withExif)
      onApply(fileId, blob)
      onClose()
    } finally {
      setBusy(false)
    }
  }, [pixels, rotation, originalDataUrl, fileId, onApply, onClose, busy])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <button type="button" onClick={onClose} aria-label="취소" className="p-2">
          <X size={22} />
        </button>
        <span className="text-sm font-medium">사진 편집</span>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          aria-label="적용"
          className="p-2 text-point-400"
        >
          <Check size={22} />
        </button>
      </div>
      <div className="relative flex-1">
        <Cropper
          image={originalDataUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          onMediaLoaded={onMediaLoaded}
          restrictPosition={false}
        />
      </div>
      {/* 비율 프리셋 */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3">
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.mode}
            type="button"
            onClick={() => setAspectMode(p.mode)}
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
      <div className="flex items-center gap-4 p-4 text-white">
        <button
          type="button"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="flex items-center gap-1 text-sm"
        >
          <RotateCw size={18} /> 회전
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1"
          aria-label="확대"
        />
      </div>
    </div>
  )
}
