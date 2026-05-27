'use client'
import { getCroppedJpeg, type PixelCrop } from '@/lib/crop-image'
import { reinjectExif } from '@/lib/exif-reinject'
import { Check, RotateCw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

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

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels)
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
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          restrictPosition={false}
        />
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
