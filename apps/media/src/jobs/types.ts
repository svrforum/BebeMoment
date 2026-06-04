export type ProcessAssetJob = {
  type: 'process-asset'
  familyId: string
  assetId: string
  // upload.convert_to_compatible snapshot at enqueue time (web reads from public schema)
  convertToCompatible: boolean
  // false 면 'asset.uploaded' 푸시를 생략한다(스토리 첨부 사진). 미설정=true(기존 동작).
  notify?: boolean
}

export type AssetJob = ProcessAssetJob
