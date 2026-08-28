import { randomBytes } from 'node:crypto'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { ServiceError } from '../error'
import { isUniqueViolation } from '../prisma-errors'
import { isAssetHiddenFromViewer } from '../story/secret-assets'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function listWidgetPhotos(
  args: { familyId: string; userId: string },
  prisma: PrismaPublic,
): Promise<string[]> {
  const rows = await prisma.widgetPhoto.findMany({
    where: { familyId: args.familyId, userId: args.userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { assetId: true },
  })
  return rows.map((r) => r.assetId)
}

/** 위젯 컬렉션에 담기/빼기. 담을 때만 자산 검증 — 뺄 때는 이미 사라진 자산도 정리할 수 있어야 한다. */
export async function toggleWidgetPhoto(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<{ inWidget: boolean }> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) {
    throw new ServiceError(403, 'asset.memberOnly')
  }

  const existing = await prismaPublic.widgetPhoto.findFirst({
    where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
  })
  if (existing) {
    await prismaPublic.widgetPhoto.deleteMany({
      where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
    })
    return { inWidget: false }
  }

  // 쓰기 시점에 가족 경계를 검증한다. 읽기 경로의 baseWhere 에 기대면 다른 가족 자산 id 가
  // 행으로 남아 조용히 무시될 뿐이라, 경계 위반이 저장 자체로는 성공해 버린다.
  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
    select: { id: true },
  })
  if (!asset) throw new ServiceError(404, 'asset.notFound')

  if (
    membership.role === 'family' &&
    (await isAssetHiddenFromViewer('family', input.assetId, prismaPublic, input.familyId))
  ) {
    throw new ServiceError(404, 'asset.notFound')
  }

  const count = await prismaPublic.widgetPhoto.count({
    where: { familyId: input.familyId, userId: input.byUserId },
  })
  try {
    await prismaPublic.widgetPhoto.create({
      data: {
        assetId: input.assetId,
        userId: input.byUserId,
        familyId: input.familyId,
        sortOrder: count,
      },
    })
  } catch (e) {
    // 동시 토글 — 멱등하게 담긴 상태로 본다.
    if (!isUniqueViolation(e)) throw e
  }

  // 컬렉션이 비어 있다가 첫 사진이 담기면 위젯이 그걸 보여주도록 소스를 켠다. 이미 담긴
  // 사진이 있었다면 사용자가 설정에서 고른 소스를 존중한다.
  if (count === 0) await switchToCollectionSource(input.byUserId, prismaPublic)

  return { inWidget: true }
}

/** 컬렉션에서 빼기. 이미 없으면 아무 일도 하지 않는다(멱등). */
export async function removeWidgetPhoto(
  args: { assetId: string; familyId: string; userId: string },
  prisma: PrismaPublic,
): Promise<void> {
  await prisma.widgetPhoto.deleteMany({
    where: { assetId: args.assetId, userId: args.userId, familyId: args.familyId },
  })
}

/** 위젯 표시 순서 변경. 컬렉션에 실제로 있는 id 만, 넘어온 순서대로. */
export async function setWidgetPhotoOrder(
  args: { familyId: string; userId: string; assetIds: string[] },
  prisma: PrismaPublic,
): Promise<void> {
  const current = new Set(await listWidgetPhotos(args, prisma))
  const ordered: string[] = []
  for (const id of args.assetIds) {
    if (current.has(id) && !ordered.includes(id)) ordered.push(id)
  }
  await prisma.$transaction(
    ordered.map((assetId, i) =>
      prisma.widgetPhoto.updateMany({
        where: { assetId, userId: args.userId, familyId: args.familyId },
        data: { sortOrder: i },
      }),
    ),
  )
}

async function switchToCollectionSource(userId: string, prisma: PrismaPublic): Promise<void> {
  // 위젯 미설치(토큰 행 없음)여도 설정만 먼저 저장 — 토큰은 위젯 등록 때 재사용된다.
  await prisma.widgetToken.upsert({
    where: { userId },
    create: {
      token: randomBytes(32).toString('hex'),
      userId,
      widgetSource: 'collection',
    },
    update: { widgetSource: 'collection' },
  })
}
