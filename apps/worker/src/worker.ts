import { type Job, Worker } from 'bullmq'
import type IORedis from 'ioredis'
import { processAsset } from './jobs/process-asset'
import type { AssetJob } from './jobs/types'
import { ASSET_QUEUE } from './queue'

export function createAssetWorker(connection: IORedis, publisher: IORedis): Worker<AssetJob> {
  return new Worker<AssetJob>(
    ASSET_QUEUE,
    async (job: Job<AssetJob>) => {
      if (job.data.type === 'process-asset') {
        return processAsset(job.data, publisher)
      }
      throw new Error(`Unknown job type: ${(job.data as { type: string }).type}`)
    },
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    },
  )
}
