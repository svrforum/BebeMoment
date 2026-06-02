import { DEFAULT_FACE_CLUSTER_DISTANCE } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'
import { z } from 'zod'

type Logger = { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }

type MlFace = {
  bbox: { x: number; y: number; w: number; h: number }
  embedding: number[]
  score: number
}

const EMBEDDING_DIM = 512
const MAX_FACES = 64

// ML 사이드카 응답은 신뢰 경계 밖 입력이다. embedding 은 정확히 vector(512) 길이의
// 유한수여야 하고(아니면 pgvector insert 가 잡 전체를 죽인다 — 멱등 DELETE 직후라
// 부분 데이터 손실), bbox 는 0..1 클램프, 얼굴 수는 상한을 둔다(DoS). 잘못된 얼굴은
// 스킵하되 잡은 살린다(§6: 한 얼굴 때문에 자산 전체를 잃지 않는다).
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

const MlFaceSchema = z.object({
  bbox: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite(),
    h: z.number().finite(),
  }),
  embedding: z.array(z.number().finite()).length(EMBEDDING_DIM),
  score: z.number().finite(),
})

export function validateMlFaces(json: unknown, logger: Logger): MlFace[] {
  const env = z.object({ faces: z.array(z.unknown()).optional() }).safeParse(json)
  if (!env.success) {
    logger.error({ err: env.error.message }, 'face-detect: ml response shape invalid')
    return []
  }
  const out: MlFace[] = []
  for (const item of (env.data.faces ?? []).slice(0, MAX_FACES)) {
    const f = MlFaceSchema.safeParse(item)
    if (!f.success) {
      logger.error({ err: f.error.message }, 'face-detect: skipping invalid face')
      continue
    }
    const b = f.data.bbox
    out.push({
      bbox: { x: clamp01(b.x), y: clamp01(b.y), w: clamp01(b.w), h: clamp01(b.h) },
      embedding: f.data.embedding,
      score: f.data.score,
    })
  }
  return out
}

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

async function callMl(mlUrl: string, bytes: Buffer, logger: Logger): Promise<MlFace[]> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'image.jpg')
  const res = await fetch(`${mlUrl.replace(/\/+$/, '')}/faces`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`ml /faces ${res.status}`)
  return validateMlFaces(await res.json(), logger)
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
  clusterDistance?: number
}): Promise<void> {
  const { familyId, assetId, prisma, storage, mlUrl, logger } = args
  // 유한수만 신뢰 — NaN/Infinity 가 들어오면 `dist <= NaN` 이 항상 false 가 돼 모든
  // 얼굴이 새 person 이 되는 조용한 군집 붕괴를 막는다.
  const maxDistance =
    args.clusterDistance !== undefined && Number.isFinite(args.clusterDistance)
      ? args.clusterDistance
      : DEFAULT_FACE_CLUSTER_DISTANCE

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, familyId, status: 'ready', deletedAt: null },
    select: { id: true, kind: true, originalKey: true },
  })
  if (!asset) return

  // 이미지: 1080 파생물 → 원본. 영상: 대표 프레임(1080)·포스터만 본다(원본 mp4 는 ML 에
  // 못 넘긴다). 영상은 단일 대표 프레임 탐지 — 다중 프레임 샘플링은 P2.
  const bytes =
    (await readBytes(storage, `derivatives/${assetId}/display1080.jpeg`)) ??
    (asset.kind === 'image'
      ? await readBytes(storage, asset.originalKey)
      : await readBytes(storage, `derivatives/${assetId}/poster.jpg`))
  if (!bytes) {
    logger.error({ assetId }, 'face-detect: no readable image bytes')
    return
  }

  const faces = await callMl(mlUrl, bytes, logger)

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
    let personId = near[0] && near[0].dist <= maxDistance ? near[0].person_id : null

    if (!personId) {
      const person = await prisma.person.create({
        data: { familyId, coverFaceId: faceId, faceCount: 0 },
        select: { id: true },
      })
      personId = person.id
    }

    await prisma.face.updateMany({ where: { id: faceId, familyId }, data: { personId } })
    // ⚠️ persons.face_count 는 권위 있는 값이 아니다 — 재검출 시 faces 를 지우되 여기서
    // 감소시키지 않아 부풀 수 있다. 표시·정렬용 장수는 모두 살아있는(미삭제·ready) 얼굴을
    // 라이브 집계한다(server/people/list.ts). 이 컬럼을 화면에 쓰지 말 것.
    await prisma.person.updateMany({
      where: { id: personId, familyId },
      data: { faceCount: { increment: 1 } },
    })
  }

  logger.info({ assetId, faces: faces.length }, 'face-detect done')
}
