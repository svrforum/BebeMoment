import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const logged = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: logged }))

const { withActionLog, actionReject } = await import('./with-action-log')
const { ServiceError } = await import('@/server/error')
const { redirect } = await import('next/navigation')

describe('withActionLog', () => {
  beforeEach(() => {
    logged.info.mockClear()
    logged.warn.mockClear()
    logged.error.mockClear()
  })

  it('성공은 { ok:true, data } 로 감싸고 아무것도 기록하지 않는다', async () => {
    await expect(withActionLog('t.ok', async () => 42)).resolves.toEqual({ ok: true, data: 42 })
    expect(logged.warn).not.toHaveBeenCalled()
    expect(logged.error).not.toHaveBeenCalled()
  })

  it('ServiceError 는 errors 네임스페이스 키로 돌려주고 warn 으로 남긴다', async () => {
    const r = await withActionLog('t.denied', async () => {
      throw new ServiceError(403, 'asset.uploadDenied')
    })
    expect(r).toEqual({ ok: false, status: 403, errorKey: 'errors.asset.uploadDenied' })
    expect(logged.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 't.denied',
        status: 403,
        key: 'errors.asset.uploadDenied',
      }),
      'action rejected',
    )
  })

  it('401 은 info 로 — 미로그인 요청은 상시라 warn 을 채우면 진짜 문제가 묻힌다', async () => {
    const r = await withActionLog('t.unauth', async () => {
      throw actionReject(401, 'errors.unauthorized')
    })
    expect(r).toEqual({ ok: false, status: 401, errorKey: 'errors.unauthorized' })
    expect(logged.info).toHaveBeenCalledTimes(1)
    expect(logged.warn).not.toHaveBeenCalled()
  })

  it('zod 실패는 invalidInput, 이슈 메시지가 카탈로그 경로면 그 키', async () => {
    const plain = await withActionLog('t.zod', async () =>
      z.object({ n: z.string().min(1) }).parse({ n: '' }),
    )
    expect(plain).toEqual({ ok: false, status: 400, errorKey: 'errors.invalidInput' })
    const keyed = await withActionLog('t.zod2', async () =>
      z
        .number()
        .refine(() => false, { message: 'admin.delivery.digestHourInQuietHours' })
        .parse(3),
    )
    expect(keyed).toEqual({
      ok: false,
      status: 400,
      errorKey: 'admin.delivery.digestHourInQuietHours',
    })
  })

  it('서비스의 plain Error 는 badRequest + 메시지', async () => {
    const r = await withActionLog('t.plain', async () => {
      throw new Error('measured_at cannot be in the future')
    })
    expect(r).toEqual({
      ok: false,
      status: 400,
      errorKey: 'errors.badRequest',
      message: 'measured_at cannot be in the future',
    })
    expect(logged.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'measured_at cannot be in the future' }),
      'action rejected',
    )
  })

  it('예상 밖 에러(하위 클래스)는 error 로 남기고 다시 던진다', async () => {
    await expect(
      withActionLog('t.bug', async () => {
        throw new TypeError('x is not a function')
      }),
    ).rejects.toThrow(TypeError)
    expect(logged.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 't.bug', err: 'x is not a function' }),
      'action failed',
    )
  })

  it('redirect() 는 손대지 않고 통과시킨다', async () => {
    await expect(
      withActionLog('t.redirect', async () => {
        redirect('/somewhere')
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
    expect(logged.warn).not.toHaveBeenCalled()
    expect(logged.error).not.toHaveBeenCalled()
  })
})
