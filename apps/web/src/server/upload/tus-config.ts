import crypto from 'node:crypto'
import { createReadStream, mkdirSync } from 'node:fs'
import { mkdir, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { createAsset } from '@/server/asset/create'
import { findDuplicate } from '@/server/asset/dedupe'
import { resolveContext } from '@/server/context'
import { parseEnv } from '@bebe/config'
import { kindOf } from '@bebe/core'
import { createAdapter } from '@bebe/storage'
import { FileStore } from '@tus/file-store'
import { Server } from '@tus/server'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const globalForTus = globalThis as unknown as {
  __bebe_tus_server?: Server
  __bebe_queue_connection?: IORedis
  __bebe_queue?: Queue
}

function getQueue(redisUrl: string): Queue {
  if (!globalForTus.__bebe_queue) {
    globalForTus.__bebe_queue_connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    })
    globalForTus.__bebe_queue = new Queue('bebe-asset', {
      connection: globalForTus.__bebe_queue_connection,
    })
  }
  return globalForTus.__bebe_queue
}

export function getTusServer(): Server {
  if (globalForTus.__bebe_tus_server) return globalForTus.__bebe_tus_server

  const env = parseEnv(process.env as Record<string, string | undefined>)
  const tusRoot =
    env.STORAGE_MODE === 'local' ? path.join(env.STORAGE_PATH, 'tus') : '/tmp/bebe-tus'

  // Ensure tus root exists at startup so FileStore can use it
  mkdirSync(tusRoot, { recursive: true })

  const datastore = new FileStore({ directory: tusRoot })

  const server = new Server({
    path: '/api/upload',
    datastore,
    async onUploadFinish(_req, upload) {
      const { session } = await getAuth()
      if (!session) throw { status_code: 401, body: 'Unauthorized' }
      const ctx = await resolveContext(
        { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
        prisma,
      )
      if (!ctx.family || !ctx.user) throw { status_code: 400, body: 'No current family' }

      const metadata = upload.metadata ?? {}
      const filename = metadata.filename ?? `upload-${upload.id}`
      const mimeType = metadata.filetype ?? 'application/octet-stream'
      const kind = kindOf(mimeType)
      if (!kind) throw { status_code: 400, body: 'Unsupported mime type' }

      const tusPath = path.join(tusRoot, upload.id)
      const hash = crypto.createHash('sha256')
      await new Promise<void>((resolve, reject) => {
        const s = createReadStream(tusPath)
        s.on('data', (c) => hash.update(c))
        s.on('end', () => {
          resolve()
        })
        s.on('error', reject)
      })
      const sha256 = hash.digest('hex')

      const dup = await findDuplicate(ctx.family.id, sha256, prisma)
      if (dup) {
        await unlink(tusPath).catch(() => {})
        return {
          status_code: 200,
          body: JSON.stringify({ assetId: dup.id, duplicate: true }),
        }
      }

      const storage = createAdapter(
        env.STORAGE_MODE === 's3'
          ? {
              mode: 's3',
              endpoint: env.STORAGE_S3_ENDPOINT as string,
              bucket: env.STORAGE_S3_BUCKET as string,
              accessKey: env.STORAGE_S3_ACCESS_KEY as string,
              secretKey: env.STORAGE_S3_SECRET_KEY as string,
              region: env.STORAGE_S3_REGION,
              forcePathStyle: true,
            }
          : { mode: 'local', path: env.STORAGE_PATH },
      )

      const asset = await createAsset(
        {
          familyId: ctx.family.id,
          uploadedByUserId: ctx.user.id,
          kind,
          originalKey: `pending/${upload.id}`,
          originalFilename: filename,
          mimeType,
          sizeBytes: BigInt(upload.size ?? 0),
          sha256,
          takenAt: new Date(),
          takenAtSource: 'uploaded',
        },
        prisma,
      )

      const finalKey = `families/${ctx.family.id}/assets/${asset.id}/original`

      if (env.STORAGE_MODE === 'local') {
        const destPath = path.join(env.STORAGE_PATH, finalKey)
        await mkdir(path.dirname(destPath), { recursive: true })
        await rename(tusPath, destPath)
      } else {
        const stream = createReadStream(tusPath)
        await storage.write(finalKey, stream)
        await unlink(tusPath).catch(() => {})
      }

      await prisma.asset.update({
        where: { id: asset.id, familyId: ctx.family.id },
        data: { originalKey: finalKey, status: 'processing' },
      })

      const queue = getQueue(env.REDIS_URL)
      await queue.add('process-asset', {
        type: 'process-asset',
        familyId: ctx.family.id,
        assetId: asset.id,
      })

      return {
        status_code: 201,
        body: JSON.stringify({ assetId: asset.id, duplicate: false }),
      }
    },
  })

  globalForTus.__bebe_tus_server = server
  return server
}
