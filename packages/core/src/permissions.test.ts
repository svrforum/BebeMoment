import { describe, expect, it } from 'vitest'
import {
  type Role,
  can,
  capabilitiesForRole,
  effectiveFamilyCapabilities,
  resolveCan,
} from './permissions'

describe('can', () => {
  const roles: Role[] = ['owner', 'guardian', 'family']

  it('owner can do everything listed', () => {
    expect(can('owner', 'family.delete')).toBe(true)
    expect(can('owner', 'member.invite')).toBe(true)
    expect(can('owner', 'member.remove')).toBe(true)
    expect(can('owner', 'asset.upload')).toBe(true)
    expect(can('owner', 'asset.delete.any')).toBe(true)
    expect(can('owner', 'asset.view.private')).toBe(true)
  })

  it('guardian can manage content and invite', () => {
    expect(can('guardian', 'member.invite')).toBe(true)
    expect(can('guardian', 'asset.upload')).toBe(true)
    expect(can('guardian', 'asset.delete.any')).toBe(true)
    expect(can('guardian', 'asset.view.private')).toBe(true)
  })

  it('guardian cannot delete family or promote owner', () => {
    expect(can('guardian', 'family.delete')).toBe(false)
    expect(can('guardian', 'member.change_role_to_owner')).toBe(false)
  })

  it('family can upload and delete own', () => {
    expect(can('family', 'asset.upload')).toBe(true)
    expect(can('family', 'asset.delete.own')).toBe(true)
    expect(can('family', 'asset.delete.any')).toBe(false)
  })

  it('family cannot view private assets', () => {
    expect(can('family', 'asset.view.private')).toBe(false)
  })

  it('family cannot invite', () => {
    expect(can('family', 'member.invite')).toBe(false)
  })

  it.each(roles)('every role can view family assets: %s', (role) => {
    expect(can(role, 'asset.view.family')).toBe(true)
  })
})

describe('record capabilities', () => {
  it.each([
    ['owner', 'record.read', true],
    ['owner', 'record.create', true],
    ['owner', 'record.edit.own', true],
    ['owner', 'record.edit.any', true],
    ['owner', 'record.delete.own', true],
    ['owner', 'record.delete.any', true],
    ['guardian', 'record.read', true],
    ['guardian', 'record.create', true],
    ['guardian', 'record.edit.own', true],
    ['guardian', 'record.edit.any', true],
    ['guardian', 'record.delete.own', true],
    ['guardian', 'record.delete.any', true],
    ['family', 'record.read', true],
    ['family', 'record.create', true],
    ['family', 'record.edit.own', true],
    ['family', 'record.edit.any', false],
    ['family', 'record.delete.own', true],
    ['family', 'record.delete.any', false],
  ] as const)('%s can %s → %s', (role, cap, expected) => {
    expect(can(role, cap)).toBe(expected)
  })
})

describe('effectiveFamilyCapabilities', () => {
  it('defaults to view/comment/react, no upload', () => {
    const s = effectiveFamilyCapabilities([])
    expect(s.has('social.comment.create')).toBe(true)
    expect(s.has('asset.view.family')).toBe(true)
    expect(s.has('asset.upload')).toBe(false)
    expect(s.has('record.create')).toBe(false)
  })
  it('adds grantable keys', () => {
    expect(effectiveFamilyCapabilities(['asset.upload']).has('asset.upload')).toBe(true)
  })
  it('ignores non-grantable / unknown keys', () => {
    expect(effectiveFamilyCapabilities(['family.delete', 'bogus']).has('family.delete')).toBe(false)
  })
})

describe('resolveCan', () => {
  it('owner unaffected by family config', () => {
    expect(resolveCan('owner', 'asset.upload', effectiveFamilyCapabilities([]))).toBe(true)
  })
  it('family follows config', () => {
    expect(resolveCan('family', 'asset.upload', effectiveFamilyCapabilities([]))).toBe(false)
    expect(resolveCan('family', 'social.comment.create', effectiveFamilyCapabilities([]))).toBe(true)
    expect(resolveCan('family', 'asset.upload', effectiveFamilyCapabilities(['asset.upload']))).toBe(
      true,
    )
  })
  it('static can() still reports family max', () => {
    expect(can('family', 'asset.upload')).toBe(true)
  })
})

describe('capabilitiesForRole', () => {
  it('owner gets full matrix, family gets effective set', () => {
    expect(
      capabilitiesForRole('owner', effectiveFamilyCapabilities([])).includes('asset.upload'),
    ).toBe(true)
    expect(
      capabilitiesForRole('family', effectiveFamilyCapabilities([])).includes('asset.upload'),
    ).toBe(false)
    expect(
      capabilitiesForRole('family', effectiveFamilyCapabilities([])).includes(
        'social.comment.create',
      ),
    ).toBe(true)
  })
})

describe('social capabilities', () => {
  it.each([
    ['owner', 'social.react', true],
    ['owner', 'social.comment.create', true],
    ['owner', 'social.comment.edit.own', true],
    ['owner', 'social.comment.delete.own', true],
    ['owner', 'social.comment.delete.any', true],
    ['guardian', 'social.react', true],
    ['guardian', 'social.comment.create', true],
    ['guardian', 'social.comment.edit.own', true],
    ['guardian', 'social.comment.delete.own', true],
    ['guardian', 'social.comment.delete.any', true],
    ['family', 'social.react', true],
    ['family', 'social.comment.create', true],
    ['family', 'social.comment.edit.own', true],
    ['family', 'social.comment.delete.own', true],
    ['family', 'social.comment.delete.any', false],
  ] as const)('%s can %s → %s', (role, cap, expected) => {
    expect(can(role, cap)).toBe(expected)
  })
})
