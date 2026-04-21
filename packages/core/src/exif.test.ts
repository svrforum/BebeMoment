import { describe, expect, it } from 'vitest'
import { parseExif } from './exif'

describe('parseExif', () => {
  it('returns empty object for unparseable buffer', async () => {
    const result = await parseExif(Buffer.from('not an image'))
    expect(result).toEqual({})
  })

  it('returns empty object for empty buffer', async () => {
    const result = await parseExif(Buffer.alloc(0))
    expect(result).toEqual({})
  })
})
