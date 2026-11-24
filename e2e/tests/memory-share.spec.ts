import { type Page, expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'
import { uploadPhotos } from './support/upload'

/**
 * 추억("N개월 전 오늘")으로 들어오면 사진 뷰어가 열린다. 거기서는 사진 한 장만 공유할 수 있어
 * 추억 묶음도, 그 사진이 속한 스토리도 보낼 길이 없었다. 이제 추억 화면의 묶음마다 공유 버튼이
 * 있고(받은 사람이 그 묶음의 사진 전부와 스토리 글을 본다), 뷰어의 공유 시트에서 스토리를 고를
 * 수 있다.
 */

/** 오늘과 같은 일(日)인 가장 가까운 지난달의 정오 — 그 달에 그 일이 없으면(31일 등) 더 거슬러 간다. */
function memoryDay(now = new Date()): Date {
  for (let k = 1; k <= 12; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, now.getDate(), 12)
    if (d.getDate() === now.getDate()) return d
  }
  throw new Error('no memory day within a year')
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 시트에서 링크를 만들고 그 토큰을 돌려준다. */
async function createLink(page: Page, sheetName: string): Promise<string> {
  const sheet = page.getByRole('dialog', { name: sheetName, exact: true })
  const created = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/share' && r.request().method() === 'POST',
  )
  await sheet.getByRole('button', { name: '공유 링크 만들기', exact: true }).click()
  const res = await created
  expect(res.status()).toBe(200)
  return ((await res.json()) as { token: string }).token
}

test.describe('추억·스토리 공유 링크', () => {
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('추억 묶음은 사진이 다 보이는 링크로, 뷰어에서는 스토리도 고른다', async ({
    page,
    browser,
  }, testInfo) => {
    // 기기의 공유 시트 대신 넘어온 제목만 적어 둔다(헤드리스 크롬엔 Web Share 가 없다).
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: { title?: string; url?: string }[] }
      w.__shared = []
      Object.defineProperty(Navigator.prototype, 'share', {
        configurable: true,
        value: async (data: { title?: string; url?: string }) => {
          w.__shared.push(data)
        },
      })
    })
    const uniq = Date.now()
    await page.goto('/')
    await useKorean(page)
    await signUpAsOwner(page, {
      username: `memo${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'Memo Tester',
    })
    await completeOnboarding(page, {
      familyName: `Memo Family ${uniq}`,
      babyName: 'Memo Baby',
      birthDate: '2025-01-01',
    })

    const day = memoryDay()
    await uploadPhotos(page, testInfo, ['m1.jpg', 'm2.jpg', 'm3.jpg'], { modifiedAt: day })
    await expect
      .poll(
        async () => {
          await page.goto('/timeline')
          return page.locator('main a[data-asset-id]').count()
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBe(3)
    const first = page.locator('main a[data-asset-id]').first()
    const storyAssetId = (await first.getAttribute('data-asset-id')) as string
    const storyPhotoNo = ((await first.getAttribute('href')) as string).match(
      /\/detail\/(\d+)/,
    )?.[1]

    // 사진 한 장을 스토리에 담는다(API — 스토리 작성 화면은 이 테스트의 관심사가 아니다).
    const story = await page.evaluate(
      async ({ assetId, entryDate }) => {
        const res = await fetch('/api/story', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            babyId: null,
            entryDate,
            body: '처음 뒤집은 날',
            assetIds: [assetId],
          }),
        })
        return res.status
      },
      { assetId: storyAssetId, entryDate: dayKey(day) },
    )
    expect(story).toBe(200)

    // ── 추억 묶음 공유 ──
    await page.goto('/memories')
    const shareMemory = page.getByRole('button', { name: /전 오늘 공유$/ })
    await expect(shareMemory).toHaveCount(1)
    const label = ((await shareMemory.getAttribute('aria-label')) as string).replace(/ 공유$/, '')
    await shareMemory.click()
    const memorySheet = page.getByRole('dialog', { name: '추억 공유 링크 만들기', exact: true })
    await expect(memorySheet).toBeVisible()
    await expect(memorySheet.getByText(/사진 3장과 스토리 글을 볼 수 있어요/)).toBeVisible()
    const memoryToken = await createLink(page, '추억 공유 링크 만들기')
    // 만든 링크는 이 추억의 시트에 바로 보인다(거둘 수 있게).
    await expect(memorySheet.getByRole('button', { name: '이 링크 해제' })).toHaveCount(1)
    // 메시지 첫 줄은 "사진 3장"이 아니라 추억의 이름이다.
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __shared: { title?: string }[] }).__shared[0]?.title,
        ),
      )
      .toBe(`${label} 🍼`)

    const baseURL = new URL(page.url()).origin
    const anon = await browser.newContext({ baseURL })
    // 받는 사람 창도 한국어로 — 로케일 쿠키가 없으면 브라우저 기본(영어)으로 뜬다.
    await anon.addCookies([{ name: 'locale', value: 'ko', url: baseURL }])
    const shared = await anon.newPage()
    await shared.goto(`/s/${memoryToken}`)
    // 연도까지 든 날짜 · 장수 · 스토리 수, 그리고 스토리 글과 사진 전부.
    const meta = new RegExp(
      `^${day.getFullYear()}년 ${day.getMonth() + 1}월 ${day.getDate()}일 · 사진 3장 · 이야기 1개$`,
    )
    await expect(shared.getByText(meta)).toBeVisible()
    await expect(shared.getByText('처음 뒤집은 날')).toBeVisible()
    const loaded = (p: Page) =>
      p
        .locator('img[src*="/media/v1/img/"]')
        .evaluateAll((els) => els.filter((el) => (el as HTMLImageElement).naturalWidth > 0).length)
    await expect.poll(() => loaded(shared), { timeout: 30_000 }).toBe(3)

    // 받은 사람(로그인 안 함)에게는 앱과 로그인으로 이어지는 버튼이 있다 — 그 날의 타임라인으로.
    await expect(shared.getByRole('link', { name: '앱에서 이어보기' })).toHaveAttribute(
      'href',
      /^intent:\/\/open\?/,
    )
    await expect(shared.getByRole('link', { name: '로그인하고 전체 보기' })).toHaveAttribute(
      'href',
      new RegExp(`/timeline\\?date=${dayKey(day)}$`),
    )

    // 링크는 만든 순간의 사진으로 고정된다 — 그 뒤 같은 날짜로 올린 사진은 따라 들어가지 않는다.
    await page.keyboard.press('Escape')
    await page.goto('/timeline')
    await uploadPhotos(page, testInfo, ['m4.jpg'], { modifiedAt: day, colorShift: 3 })
    await expect
      .poll(
        async () => {
          await page.goto('/timeline')
          return page.locator('main a[data-asset-id]').count()
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBe(4)
    await shared.reload()
    await expect(shared.getByText(meta)).toBeVisible()
    await expect.poll(() => loaded(shared), { timeout: 30_000 }).toBe(3)

    // 가족으로 로그인한 사람은 공개용 화면을 거치지 않는다 — 탭이 있는 앱 화면(그 날의 타임라인)으로 간다.
    await page.goto(`/s/${memoryToken}`)
    await expect(page).toHaveURL(new RegExp(`/timeline\\?date=${dayKey(day)}$`))
    await expect(page.getByRole('link', { name: '캘린더' }).first()).toBeVisible()
    await expect(page.locator('main a[data-asset-id]')).toHaveCount(4)

    // ── 뷰어에서 스토리 공유 ──
    // 뷰어의 액션바(공유 버튼)는 모바일 폭에서만 뜬다. 업로드는 데스크탑 폭에서 했다 — 모바일
    // 폭에서는 + 가 업로드 시트 대신 기기의 파일 선택기를 바로 연다.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/memories')
    await page.locator(`a[href="/detail/${storyPhotoNo}?ctx=memories"]`).click()
    await expect(page).toHaveURL(new RegExp(`/detail/${storyPhotoNo}\\?`))
    await page.getByRole('button', { name: '공유', exact: true }).click()
    // 열면 예전처럼 '이 사진'이다.
    const photoSheet = page.getByRole('dialog', { name: '사진 공유 링크 만들기', exact: true })
    await expect(photoSheet).toBeVisible()
    const choose = photoSheet.getByRole('group', { name: '공유할 대상' })
    await expect(choose.getByRole('button', { name: '이 사진' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await choose.getByRole('button', { name: '스토리' }).click()
    const storySheet = page.getByRole('dialog', { name: '공유 링크 만들기', exact: true })
    await expect(storySheet.getByText(/대표 사진과 글을 볼 수 있어요/)).toBeVisible()
    const storyToken = await createLink(page, '공유 링크 만들기')

    await shared.goto(`/s/${storyToken}`)
    await expect(shared.getByText('처음 뒤집은 날')).toBeVisible()
    await anon.close()

    // 스토리에 없는 사진에서는 고르는 칸이 없다 — 예전 그대로 사진 한 장 공유.
    await page.keyboard.press('Escape')
    await page.goto('/timeline')
    const loose = page.locator(`main a[data-asset-id]:not([data-asset-id="${storyAssetId}"])`)
    await page.goto((await loose.first().getAttribute('href')) as string)
    await page.getByRole('button', { name: '공유', exact: true }).click()
    await expect(photoSheet).toBeVisible()
    await expect(photoSheet.getByRole('group', { name: '공유할 대상' })).toHaveCount(0)
  })
})
