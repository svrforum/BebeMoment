import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'

type Logger = { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }

type MlFace = {
  bbox: { x: number; y: number; w: number; h: number }
  embedding: number[]
  score: number
}

// 같은 사람으로 묶을 코사인 거리 임계(작을수록 엄격). ArcFace 정규화 임베딩 기준
// 같은 사람은 보통 < 0.4, 다른 사람은 > 0.6. P2 에서 튜닝.
const CLUSTER_MAX_DISTANCE = 0.45

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks)
}

async function readBytes(storage: StorageAdapter, key: string): Promise<Buffer | null> {
  try {
    return await collect(await storage.read(key))
  } catch {
    return null
  }
}

async function callMl(mlUrl: string, bytes: Buffer): Promise<MlFace[]> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'image.jpg')
  const res = await fetch(`${mlUrl.replace(/\/+$/, '')}/faces`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`ml /faces ${res.status}`)
  const json = (await res.json()) as { faces?: MlFace[] }
  return json.faces ?? []
}

function vecLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * 한 자산의 얼굴을 인식해 저장·군집한다. ML 사이드카가 탐지·정렬·임베딩을 처리하고,
 * 여기선 결과를 pgvector(media.faces)에 raw 로 넣고 증분 군집(media.persons)한다.
 * features.faces 게이팅은 호출자(web)가 — 여기까지 온 잡은 처리한다.
 */
export async function faceDetect(args: {
  familyId: string
  assetId: string
  prisma: PrismaClient
  storage: StorageAdapter
  mlUrl: string
  logger: Logger
}): Promise<void> {
  const { familyId, assetId, prisma, storage, mlUrl, logger } = args

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, familyId, status: 'ready', deletedAt: null },
    select: { id: true, kind: true, originalKey: true },
  })
  if (!asset) return
  if (asset.kind !== 'image') return // 영상 얼굴인식은 비범위(P1)

  // 1080 파생물(JPEG) 우선, 없으면 원본.
  const bytes =
    (await readBytes(storage, `derivatives/${assetId}/display1080.jpeg`)) ??
    (await readBytes(storage, asset.originalKey))
  if (!bytes) {
    logger.error({ assetId }, 'face-detect: no readable image bytes')
    return
  }

  const faces = await callMl(mlUrl, bytes)

  // 재실행 멱등: 이 자산의 기존 얼굴 제거 후 새로 넣는다.
  await prisma.$executeRawUnsafe(
    'DELETE FROM media.faces WHERE asset_id = $1::uuid AND family_id = $2::uuid',
    assetId,
    familyId,
  )

  for (const f of faces) {
    const emb = vecLiteral(f.embedding)
    const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO media.faces
         (family_id, asset_id, bbox_x, bbox_y, bbox_w, bbox_h, det_score, embedding)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::vector)
       RETURNING id`,
      familyId,
      assetId,
      f.bbox.x,
      f.bbox.y,
      f.bbox.w,
      f.bbox.h,
      f.score,
      emb,
    )
    const faceId = inserted[0]?.id
    if (!faceId) continue

    // 증분 군집 — 같은 가족의 이미 배정된 얼굴 중 가장 가까운 것.
    const near = await prisma.$queryRawUnsafe<{ person_id: string; dist: number }[]>(
      `SELECT person_id, (embedding <=> $1::vector) AS dist
         FROM media.faces
        WHERE family_id = $2::uuid AND person_id IS NOT NULL AND id <> $3::uuid
        ORDER BY embedding <=> $1::vector
        LIMIT 1`,
      emb,
      familyId,
      faceId,
    )
    let personId = near[0] && near[0].dist <= CLUSTER_MAX_DISTANCE ? near[0].person_id : null

    if (!personId) {
      const person = await prisma.person.create({
        data: { familyId, coverFaceId: faceId, faceCount: 0 },
        select: { id: true },
      })
      personId = person.id
    }

    await prisma.face.updateMany({ where: { id: faceId, familyId }, data: { personId } })
    await prisma.person.updateMany({
      where: { id: personId, familyId },
      data: { faceCount: { increment: 1 } },
    })
  }

  logger.info({ assetId, faces: faces.length }, 'face-detect done')
}
