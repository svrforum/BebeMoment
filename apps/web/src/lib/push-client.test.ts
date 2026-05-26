import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from './push-client'

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key with padding + char replacement', () => {
    // "Man" -> base64 "TWFu" (no padding needed)
    expect(Array.from(urlBase64ToUint8Array('TWFu'))).toEqual([0x4d, 0x61, 0x6e])
  })

  it('pads strings whose length is not a multiple of 4', () => {
    // "M" -> base64 "TQ==" (base64url "TQ" needs padding)
    expect(Array.from(urlBase64ToUint8Array('TQ'))).toEqual([0x4d])
    // "Ma" -> base64 "TWE=" (base64url "TWE")
    expect(Array.from(urlBase64ToUint8Array('TWE'))).toEqual([0x4d, 0x61])
  })

  it('translates base64url -_ back to base64 +/ before decoding', () => {
    // bytes [0xfb, 0xff, 0xbf] -> base64 "+/+/" -> base64url "-_-_"
    expect(Array.from(urlBase64ToUint8Array('-_-_'))).toEqual([0xfb, 0xff, 0xbf])
  })

  it('produces a 65-byte uncompressed P-256 point from a real VAPID public key', () => {
    // 87-char base64url applicationServerKey decodes to 65 bytes
    // (0x04 uncompressed-point prefix + 32-byte X + 32-byte Y).
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh85'
    const out = urlBase64ToUint8Array(key)
    expect(out.length).toBe(65)
    expect(out[0]).toBe(0x04)
  })
})
