import { describe, expect, it } from 'vitest'
import { resolveChainFrom } from './chain'
import type { BackupManifest } from './manifest'

function m(id: string, type: 'full' | 'incr', parentId: string | null): BackupManifest {
  return {
    version: 1,
    id,
    createdAt: `2026-08-30T0${id.length % 9}:00:00.000Z`,
    type,
    parentId,
    schemaMigrations: [],
    includesSecret: false,
    dataFileCount: 0,
    dataBytes: 0,
  }
}

const base = m('b1', 'full', null)
const i1 = m('i1', 'incr', 'b1')
const i2 = m('i2', 'incr', 'i1')

describe('resolveChainFrom', () => {
  it('full 하나면 그것만', () => {
    expect(resolveChainFrom([base], 'b1').map((x) => x.id)).toEqual(['b1'])
  })

  it('증분은 베이스부터 순서대로 — 적용 순서가 곧 이 순서다', () => {
    expect(resolveChainFrom([i2, i1, base], 'i2').map((x) => x.id)).toEqual(['b1', 'i1', 'i2'])
  })

  it('중간 대상을 고르면 그 뒤 증분은 빠진다', () => {
    expect(resolveChainFrom([i2, i1, base], 'i1').map((x) => x.id)).toEqual(['b1', 'i1'])
  })

  it('베이스가 없으면 거부한다 — 반쯤 복구하면 DB 만 덮어쓴 상태로 남는다', () => {
    expect(() => resolveChainFrom([i2, i1], 'i2')).toThrow()
  })

  it('대상 자체가 없으면 거부한다', () => {
    expect(() => resolveChainFrom([base], 'nope')).toThrow()
  })

  it('베이스가 full 이 아니면 거부한다', () => {
    const orphan = m('o1', 'incr', null)
    expect(() => resolveChainFrom([orphan], 'o1')).toThrow()
  })

  it('부모가 순환하면 무한루프 대신 거부한다', () => {
    const a = m('a', 'incr', 'b')
    const b = m('b', 'incr', 'a')
    expect(() => resolveChainFrom([a, b], 'a')).toThrow()
  })
})
