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
