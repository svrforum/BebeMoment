// 브라우저 캔버스로 이미지를 잘라/회전해 JPEG dataURL 을 만든다. 회전은 작업본에
// baked 하고(rotateJpeg90), 크롭은 원본(자연) 픽셀 좌표로 받는다(react-image-crop 의
// 화면 좌표를 호출부에서 naturalWidth/표시너비 비율로 환산해 넘김).

export type PixelRect = { x: number; y: number; width: number; height: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 자연 픽셀 좌표의 사각형을 잘라 JPEG dataURL 로. */
export async function getCroppedJpeg(
  imageSrc: string,
  rect: PixelRect,
  quality = 0.92,
): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width))
  canvas.height = Math.max(1, Math.round(rect.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 없음')
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 이미지를 시계방향 90° 회전한 JPEG dataURL. 회전은 픽셀에 baked. */
export async function rotateJpeg90(imageSrc: string, quality = 0.92): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalHeight
  canvas.height = image.naturalWidth
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 없음')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  return canvas.toDataURL('image/jpeg', quality)
}
