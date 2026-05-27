// react-easy-crop 의 croppedAreaPixels + rotation 을 캔버스로 렌더해 JPEG dataURL 반환.
// 브라우저 전용(canvas). 회전 baked.
export type PixelCrop = { x: number; y: number; width: number; height: number }

export async function getCroppedJpeg(
  imageSrc: string,
  crop: PixelCrop,
  rotationDeg: number,
  quality = 0.92,
): Promise<string> {
  const image = await loadImage(imageSrc)
  const rad = (rotationDeg * Math.PI) / 180
  // 회전 후 바운딩 박스 기준 안전 캔버스에 원본을 회전 그려서 크롭 영역만 추출
  const safe = Math.max(image.width, image.height) * 2
  const tmp = document.createElement('canvas')
  tmp.width = safe
  tmp.height = safe
  const tctx = tmp.getContext('2d')
  if (!tctx) throw new Error('canvas 2d context 없음')
  tctx.translate(safe / 2, safe / 2)
  tctx.rotate(rad)
  tctx.drawImage(image, -image.width / 2, -image.height / 2)
  const data = tctx.getImageData(0, 0, safe, safe)

  const out = document.createElement('canvas')
  out.width = crop.width
  out.height = crop.height
  const octx = out.getContext('2d')
  if (!octx) throw new Error('canvas 2d context 없음')
  octx.putImageData(
    data,
    Math.round(-safe / 2 + image.width / 2 - crop.x),
    Math.round(-safe / 2 + image.height / 2 - crop.y),
  )
  return out.toDataURL('image/jpeg', quality)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
