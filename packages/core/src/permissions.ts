export type Role = 'owner' | 'guardian' | 'family'

export type Capability =
  | 'family.delete'
  | 'family.edit'
  | 'member.invite'
  | 'member.remove'
  | 'member.suspend'
  | 'member.reset_password'
  | 'member.change_role_to_owner'
  | 'member.change_role'
  | 'baby.create'
  | 'baby.edit'
  | 'baby.delete'
  | 'asset.upload'
  | 'asset.edit.own'
  | 'asset.edit.any'
  | 'asset.delete.own'
  | 'asset.delete.any'
  | 'asset.view.family'
  | 'asset.view.private'
  | 'record.read'
  | 'record.create'
  | 'record.edit.own'
  | 'record.edit.any'
  | 'record.delete.own'
  | 'record.delete.any'
  | 'social.react'
  | 'social.comment.create'
  | 'social.comment.edit.own'
  | 'social.comment.delete.own'
  | 'social.comment.delete.any'
  | 'album.create'
  | 'album.update.own'
  | 'album.update.any'
  | 'album.delete.own'
  | 'album.delete.any'
  | 'album.asset.attach'
  | 'album.asset.detach'
  | 'person.rename'
  | 'share.create'

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    'family.delete',
    'family.edit',
    'member.invite',
    'member.remove',
    'member.suspend',
    'member.reset_password',
    'member.change_role',
    'member.change_role_to_owner',
    'baby.create',
    'baby.edit',
    'baby.delete',
    'asset.upload',
    'asset.edit.own',
    'asset.edit.any',
    'asset.delete.own',
    'asset.delete.any',
    'asset.view.family',
    'asset.view.private',
    'record.read',
    'record.create',
    'record.edit.own',
    'record.edit.any',
    'record.delete.own',
    'record.delete.any',
    'social.react',
    'social.comment.create',
    'social.comment.edit.own',
    'social.comment.delete.own',
    'social.comment.delete.any',
    'album.create',
    'album.update.own',
    'album.update.any',
    'album.delete.own',
    'album.delete.any',
    'album.asset.attach',
    'album.asset.detach',
    'person.rename',
    'share.create',
  ],
  guardian: [
    'family.edit',
    'member.invite',
    'member.change_role',
    'baby.create',
    'baby.edit',
    'baby.delete',
    'asset.upload',
    'asset.edit.own',
    'asset.edit.any',
    'asset.delete.own',
    'asset.delete.any',
    'asset.view.family',
    'asset.view.private',
    'record.read',
    'record.create',
    'record.edit.own',
    'record.edit.any',
    'record.delete.own',
    'record.delete.any',
    'social.react',
    'social.comment.create',
    'social.comment.edit.own',
    'social.comment.delete.own',
    'social.comment.delete.any',
    'album.create',
    'album.update.own',
    'album.update.any',
    'album.delete.own',
    'album.delete.any',
    'album.asset.attach',
    'album.asset.detach',
    'person.rename',
    'share.create',
  ],
  family: [
    'asset.upload',
    'asset.edit.own',
    'asset.delete.own',
    'asset.view.family',
    'record.read',
    'record.create',
    'record.edit.own',
    'record.delete.own',
    'social.react',
    'social.comment.create',
    'social.comment.edit.own',
    'social.comment.delete.own',
    'album.create',
    'album.update.own',
    'album.delete.own',
    'album.asset.attach',
    'album.asset.detach',
    'person.rename',
    'share.create',
  ],
}

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability)
}

export const DEFAULT_FAMILY_CAPABILITIES: Capability[] = [
  'asset.view.family',
  'record.read',
  'social.react',
  'social.comment.create',
  'social.comment.edit.own',
  'social.comment.delete.own',
]

export const GRANTABLE_FAMILY_CAPABILITIES: Capability[] = [
  'asset.upload',
  'asset.edit.own',
  'asset.delete.own',
  'record.create',
  'record.edit.own',
  'record.delete.own',
  'album.create',
  'album.update.own',
  'album.delete.own',
  'album.asset.attach',
  'album.asset.detach',
  'person.rename',
  // 공유 링크 발행은 인증 경계 밖 노출이라 family 기본은 차단(DEFAULT 미포함). 관리자가
  // 명시적으로 부여할 수 있게 grantable 로만 둔다.
  'share.create',
]

const GRANTABLE_SET = new Set<string>(GRANTABLE_FAMILY_CAPABILITIES)

export function effectiveFamilyCapabilities(grantedKeys: string[]): Set<Capability> {
  const set = new Set<Capability>(DEFAULT_FAMILY_CAPABILITIES)
  for (const key of grantedKeys) {
    if (GRANTABLE_SET.has(key)) set.add(key as Capability)
  }
  return set
}

export function resolveCan(
  role: Role,
  capability: Capability,
  familyCapabilities: Set<Capability>,
): boolean {
  if (role === 'family') return familyCapabilities.has(capability)
  return can(role, capability)
}

export function capabilitiesForRole(role: Role, familyCapabilities: Set<Capability>): Capability[] {
  if (role === 'family') return Array.from(familyCapabilities)
  return MATRIX[role]
}
