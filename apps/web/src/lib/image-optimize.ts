import { reinjectExif } from './exif-reinject'

// 업로드 전 클라이언트 최적화: 긴 변을 MAX_EDGE 로 제한 + JPEG 재인코딩으로 용량을
// 줄인다. EXIF(촬영일·GPS)는 재주입해 보존(Orientation=1, 픽셀은 이미 정위치).
// 안드로이드/iOS/웹 공통 — <img> 디코드(브라우저가 EXIF 회전 자동 적용)+canvas.
const MAX_EDGE = 4096
const QUALITY = 0.85

const STORAGE_KEY = 'bebe.upload.optimize'

export function isOptimizeEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== 'off'
}

export function setOptimizeEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// 이미지면 최적화한 새 File 을, 아니거나(영상·gif) 디코드 실패·이득 없음이면 원본을 반환.
export async function optimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    return file // HEIC on non-Safari 등 디코드 불가 → 원본 유지
  }

  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  if (!w0 || !h0) return file
  const longEdge = Math.max(w0, h0)
  // 긴 변이 한도 이하면 리사이즈 이득이 없다 — 재인코딩(q0.85)은 화질만 깎으므로 원본을
  // 그대로 둔다("원본은 원본"). 최적화는 실제로 축소가 필요한 큰 사진에만 적용.
  if (longEdge <= MAX_EDGE) return file
  const scale = MAX_EDGE / longEdge
  const w = Math.round(w0 * scale)
  const h = Math.round(h0 * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
  if (!blob) return file

  let outBlob: Blob = blob
  if (file.type === 'image/jpeg') {
    try {
      const [origUrl, editedUrl] = await Promise.all([blobToDataUrl(file), blobToDataUrl(blob)])
      outBlob = dataUrlToBlob(reinjectExif(origUrl, editedUrl))
    } catch {
      // 원본에 EXIF 가 없거나 파싱 실패 — 메타 없이 그대로 진행.
    }
  }

  if (outBlob.size >= file.size) return file // 이득 없으면 원본 유지

  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([outBlob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}
