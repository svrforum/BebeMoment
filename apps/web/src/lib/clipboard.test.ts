import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

type FakeTextarea = {
  value: string
  style: Record<string, string>
  setAttribute: () => void
  select: () => void
  setSelectionRange: () => void
}

function stubDom(opts: {
  secure: boolean
  writeText?: (text: string) => Promise<void>
  execCommand?: () => boolean
}) {
  const appended: FakeTextarea[] = []
  vi.stubGlobal('window', { isSecureContext: opts.secure })
  vi.stubGlobal(
    'navigator',
    opts.writeText ? { clipboard: { writeText: vi.fn(opts.writeText) } } : {},
  )
  vi.stubGlobal('document', {
    createElement: (): FakeTextarea => ({
      value: '',
      style: {},
      setAttribute: () => {},
      select: () => {},
      setSelectionRange: () => {},
    }),
    body: {
      appendChild: (el: FakeTextarea) => appended.push(el),
      removeChild: () => {},
    },
    execCommand: vi.fn(opts.execCommand ?? (() => true)),
  })
  return { appended }
}

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('보안 컨텍스트면 Clipboard API 를 쓴다', async () => {
    const writes: string[] = []
    stubDom({
      secure: true,
      writeText: async (t) => {
        writes.push(t)
      },
    })
    expect(await copyText('https://example.com/a')).toBe(true)
    expect(writes).toEqual(['https://example.com/a'])
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('LAN http(비보안)에선 Clipboard API 대신 execCommand 로 복사한다', async () => {
    const { appended } = stubDom({ secure: false, writeText: async () => {} })
    expect(await copyText('http://nas.example.com:3000/invite/x')).toBe(true)
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(appended[0]?.value).toBe('http://nas.example.com:3000/invite/x')
  })

  it('Clipboard API 가 거절하면 execCommand 로 한 번 더 시도한다', async () => {
    stubDom({
      secure: true,
      writeText: async () => {
        throw new DOMException('denied', 'NotAllowedError')
      },
    })
    expect(await copyText('x')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('둘 다 안 되면 false — 호출자가 실패를 알린다', async () => {
    stubDom({ secure: false, execCommand: () => false })
    expect(await copyText('x')).toBe(false)
  })
})
