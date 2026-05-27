import piexif from 'piexifjs'

/**
 * 편집본 JPEG(EXIF 없음)에 원본 JPEG 의 EXIF 를 재주입한다. 크롭/회전은 픽셀에
 * baked 되므로 Orientation 은 1(정상)로 강제. 원본에 EXIF 가 없거나 비표준이면
 * 편집본을 그대로 반환(편집은 사용자 의사 — §5 자동변환 아님).
 * 입출력은 `data:image/jpeg;base64,...` dataURL.
 */
export function reinjectExif(originalJpegDataUrl: string, editedJpegDataUrl: string): string {
  let exifObj: ReturnType<typeof piexif.load>
  try {
    exifObj = piexif.load(originalJpegDataUrl)
  } catch {
    return editedJpegDataUrl
  }
  if (!exifObj['0th']) exifObj['0th'] = {}
  exifObj['0th'][piexif.ImageIFD.Orientation] = 1
  try {
    const exifBytes = piexif.dump(exifObj)
    return piexif.insert(exifBytes, editedJpegDataUrl)
  } catch {
    return editedJpegDataUrl
  }
}
