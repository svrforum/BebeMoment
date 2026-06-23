import { describe, expect, it } from 'vitest'
import { readJsonLimited } from './read-json-limited'

function jsonReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://x/api', { method: 'POST', body, headers })
}

describe('readJsonLimited', () => {
  it('parses a small JSON body', async () => {
    const out = await readJsonLimited(jsonReq(JSON.stringify({ a: 1 })), 1024)
    expect(out).toEqual({ a: 1 })
  })

  it('rejects when Content-Length exceeds the cap', async () => {
    const big = JSON.stringify({ x: 'y'.repeat(500) })
    await expect(
      readJsonLimited(jsonReq(big, { 'content-length': String(big.length) }), 64),
    ).rejects.toMatchObject({ status: 413 })
  })

  it('rejects when the streamed body exceeds the cap even without Content-Length', async () => {
    // ReadableStream body → no content-length header is set by the runtime
    const big = 'z'.repeat(2000)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big))
        controller.close()
      },
    })
    const req = new Request('http://x/api', {
      method: 'POST',
      body: stream,
      // @ts-expect-error duplex is required by undici for a stream body
      duplex: 'half',
    })
    await expect(readJsonLimited(req, 64)).rejects.toMatchObject({ status: 413 })
  })
})
