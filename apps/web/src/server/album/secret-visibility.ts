import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

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

/**
 * family 역할에게 이 앨범이 비밀(자신 또는 조상이 secret)인지 — 즉 숨겨야 하는지.
 * owner/guardian 은 항상 false(전부 보임). 존재하지 않는 앨범은 false(호출부가 별도 처리).
 *
 * 자식 목록·앨범 사진·앨범 스토리 읽기와 쓰기 경로(attach-assets/entries·move)가 이걸로
 * 막는다(트리·상세·검색은 이미 읽어 온 행으로 직접 판정한다). family 도 album.asset.attach
 * 능력을 가질 수 있어, 쓰기 경로가 안 막으면 비밀 앨범 UUID 를 알아낸 family 가 그 앨범에
 * 사진을 넣거나(숨긴 앨범 변조) 응답 차이로 존재를 확인할 수 있었다.
 */
export async function isAlbumSecretForViewer(
  args: { albumId: string; familyId: string; viewerRole: Role },
  prisma: PrismaPublic,
): Promise<boolean> {
  if (args.viewerRole !== 'family') return false
  return isAlbumSecretOrUnderSecret({ albumId: args.albumId, familyId: args.familyId }, prisma)
}
