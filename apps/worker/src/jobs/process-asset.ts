import type IORedis from 'ioredis'
import type { ProcessAssetJob } from './types'

export async function processAsset(_job: ProcessAssetJob, _publisher: IORedis): Promise<void> {
  throw new Error('processAsset not implemented yet')
}
