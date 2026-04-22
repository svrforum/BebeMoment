import { describe, expect, it } from 'vitest'
import { type Role, can } from './permissions'

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
