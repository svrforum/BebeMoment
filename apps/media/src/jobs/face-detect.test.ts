import { describe, expect, it, vi } from 'vitest'
import { validateMlFaces } from './face-detect'

const logger = { info: vi.fn(), error: vi.fn() }
const emb = (v = 0.1) => Array.from({ length: 512 }, () => v)

describe('validateMlFaces', () => {
  it('accepts a well-formed face and clamps bbox to 0..1', () => {
    const out = validateMlFaces(
      { faces: [{ bbox: { x: -0.2, y: 0.5, w: 1.4, h: 0.3 }, embedding: emb(), score: 0.9 }] },
      logger,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.bbox).toEqual({ x: 0, y: 0.5, w: 1, h: 0.3 })
  })

  it('rejects wrong-length embedding (vector(512) mismatch would crash the job)', () => {
    const out = validateMlFaces(
      { faces: [{ bbox: { x: 0, y: 0, w: 1, h: 1 }, embedding: [1, 2, 3], score: 0.9 }] },
      logger,
    )
    expect(out).toHaveLength(0)
  })

  it('rejects NaN/Infinity in embedding (pgvector rejects non-finite)', () => {
    const bad = emb()
    bad[0] = Number.NaN
    expect(
      validateMlFaces(
        { faces: [{ bbox: { x: 0, y: 0, w: 1, h: 1 }, embedding: bad, score: 1 }] },
        logger,
      ),
    ).toHaveLength(0)
  })

  it('skips invalid faces but keeps valid ones in the same response', () => {
    const out = validateMlFaces(
      {
        faces: [
          { bbox: { x: 0, y: 0, w: 1, h: 1 }, embedding: emb(), score: 0.9 },
          { bbox: { x: 0, y: 0, w: 1, h: 1 }, embedding: [1], score: 0.9 },
        ],
      },
      logger,
    )
    expect(out).toHaveLength(1)
  })

  it('caps faces at 64 (DoS bound)', () => {
    const faces = Array.from({ length: 100 }, () => ({
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      embedding: emb(),
      score: 0.5,
    }))
    expect(validateMlFaces({ faces }, logger)).toHaveLength(64)
  })

  it('returns [] for non-object / missing faces', () => {
    expect(validateMlFaces(null, logger)).toEqual([])
    expect(validateMlFaces({}, logger)).toEqual([])
    expect(validateMlFaces('nope', logger)).toEqual([])
  })
})
