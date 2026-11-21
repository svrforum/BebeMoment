import { describe, expect, test } from 'vitest'
import { createEntryMemory } from './entry-memory'

describe('createEntryMemory', () => {
  test('gives back what was put under the same entry key', () => {
    const memory = createEntryMemory<string>(3)
    memory.put('k1', 'deep in september')
    expect(memory.take('k1')).toBe('deep in september')
  })

  test('another entry of the same page gets nothing', () => {
    const memory = createEntryMemory<string>(3)
    memory.put('k1', 'a')
    expect(memory.take('k2')).toBeUndefined()
  })

  test('taking forgets — a second return starts from what is saved next', () => {
    const memory = createEntryMemory<string>(3)
    memory.put('k1', 'a')
    memory.take('k1')
    expect(memory.take('k1')).toBeUndefined()
  })

  test('a later put under the same key replaces the earlier one', () => {
    const memory = createEntryMemory<string>(3)
    memory.put('k1', 'a')
    memory.put('k1', 'b')
    expect(memory.take('k1')).toBe('b')
  })

  test('keeps only the most recently put entries', () => {
    const memory = createEntryMemory<string>(2)
    memory.put('k1', 'a')
    memory.put('k2', 'b')
    memory.put('k3', 'c')
    expect(memory.take('k1')).toBeUndefined()
    expect(memory.take('k2')).toBe('b')
    expect(memory.take('k3')).toBe('c')
  })

  test('putting again counts as recent', () => {
    const memory = createEntryMemory<string>(2)
    memory.put('k1', 'a')
    memory.put('k2', 'b')
    memory.put('k1', 'a2')
    memory.put('k3', 'c')
    expect(memory.take('k2')).toBeUndefined()
    expect(memory.take('k1')).toBe('a2')
  })

  test('forget drops one entry and leaves the rest', () => {
    const memory = createEntryMemory<string>(3)
    memory.put('k1', 'a')
    memory.put('k2', 'b')
    memory.forget('k1')
    expect(memory.take('k1')).toBeUndefined()
    expect(memory.take('k2')).toBe('b')
  })
})
