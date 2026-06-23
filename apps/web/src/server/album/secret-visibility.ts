import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

/**
 * family 역할에게 이 앨범이 비밀(자신 또는 조상이 secret)인지 — 즉 숨겨야 하는지.
 * owner/guardian 은 항상 false(전부 보임). 존재하지 않는 앨범은 false(호출부가 별도 처리).
 *
 * 읽기 경로(getAlbumWithBreadcrumbs/list/tree/search)는 이미 viewerRole 로 비밀을
 * 가린다. 쓰기 경로(attach-assets/entries)는 album.asset.attach 능력을 family 도 갖기에,
 * 비밀 앨범 UUID 를 외부에서 알아내면 그 앨범에 attach 하거나(은닉 콘텐츠 변조) 응답
 * 차이로 존재를 확인할 수 있었다(§21 위반). 이 헬퍼로 쓰기 경로도 동일하게 막는다.
 */
/**
 * 역할 무관 — 이 앨범이 비밀이거나(자신) 비밀 조상 아래 있는지. 인증 경계 밖(공유 링크)에서는
 * "누가 만들든" 트리에서 숨겨진 앨범을 공개하면 안 되므로 viewerRole 없이 판정한다.
 */
export async function isAlbumSecretOrUnderSecret(
  args: { albumId: string; familyId: string },
  prisma: PrismaPublic,
): Promise<boolean> {
  const album = await prisma.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
    select: { secret: true, path: true },
  })
  if (!album) return false
  if (album.secret) return true
  const ancestorIds = album.path.split('/').filter(Boolean)
  if (ancestorIds.length === 0) return false
  const ancestors = await prisma.album.findMany({
    where: { id: { in: ancestorIds }, familyId: args.familyId },
    select: { secret: true },
  })
  return ancestors.some((a) => a.secret)
}

export async function isAlbumSecretForViewer(
  args: { albumId: string; familyId: string; viewerRole: Role },
  prisma: PrismaPublic,
): Promise<boolean> {
  if (args.viewerRole !== 'family') return false
  return isAlbumSecretOrUnderSecret({ albumId: args.albumId, familyId: args.familyId }, prisma)
}
