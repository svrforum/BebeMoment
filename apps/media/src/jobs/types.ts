export type ProcessAssetJob = {
  type: 'process-asset'
  familyId: string
  assetId: string
  // upload.convert_to_compatible snapshot at enqueue time (web reads from public schema)
  convertToCompatible: boolean
}

export type AssetJob = ProcessAssetJob
