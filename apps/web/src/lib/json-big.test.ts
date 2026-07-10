import { describe, expect, it } from 'vitest'
import { jsonBig, serializeBig } from './json-big'

// Regression: asset rows carry `sizeBytes` as a Prisma BigInt. `NextResponse.json`
// (JSON.stringify) throws "Do not know how to serialize a BigInt" → the story
// list/detail routes returned an empty 500. serializeBig must survive it.
describe('serializeBig', () => {
  it('reproduces the crash: plain JSON.stringify throws on BigInt', () => {
    const storyPageLike = { items: [{ asset: { id: 'a', sizeBytes: 7027712n } }] }
    expect(() => JSON.stringify(storyPageLike)).toThrow(TypeError)
  })

  it('serializes nested/array BigInt to Number instead of throwing', () => {
    const payload = { items: [{ asset: { sizeBytes: 7027712n } }], list: [1n, 2n] }
    const out = JSON.parse(serializeBig(payload))
    expect(out).toEqual({ items: [{ asset: { sizeBytes: 7027712 } }], list: [1, 2] })
  })
})

describe('jsonBig', () => {
  it('returns a JSON response with BigInt fields serialized', async () => {
    const res = jsonBig({ sizeBytes: 12345n })
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ sizeBytes: 12345 })
  })

  it('passes through status and other init', () => {
    const res = jsonBig({ ok: true }, { status: 201 })
    expect(res.status).toBe(201)
  })
})
