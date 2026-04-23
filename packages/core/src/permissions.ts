export type Role = 'owner' | 'guardian' | 'family'

export type Capability =
  | 'family.delete'
  | 'family.edit'
  | 'member.invite'
  | 'member.remove'
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

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    'family.delete',
    'family.edit',
    'member.invite',
    'member.remove',
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
  ],
  guardian: [
    'family.edit',
    'member.invite',
    'member.remove',
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
  ],
}

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability)
}
