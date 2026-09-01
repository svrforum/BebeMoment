import { expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'
import { uploadOnePhoto, waitForTimelineThumb } from './support/upload'

test.describe('P6 social smoke', () => {
  // 인스턴스당 가족 1개 — 스펙마다 깨끗한 DB 에서 시작해야 가입이 열린다.
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('like + comment + bookmark + detail view', async ({ page }, testInfo) => {
    const uniq = Date.now()

    await page.goto('/')
    await useKorean(page)
    await signUpAsOwner(page, {
      username: `p6u${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'P6 User',
    })
    await completeOnboarding(page, {
      familyName: `P6 Family ${uniq}`,
      babyName: 'P6 Baby',
      birthDate: '2026-01-01',
    })

    await uploadOnePhoto(page, testInfo, `p6-${uniq}.jpg`)
    expect(await waitForTimelineThumb(page)).toBeTruthy()

    const detailLink = page.locator('main a[href^="/detail/"]').first()
    const href = await detailLink.getAttribute('href')
    expect(href).toMatch(/^\/detail\/[0-9a-f-]+$/)
    if (!href) throw new Error('detail link href missing')
    await detailLink.click()
    await page.waitForURL(/\/detail\//)

    // Desktop layout
    await expect(page.getByRole('heading', { name: '세부정보' })).toBeVisible()

    // Like
    const likeBtn = page.getByRole('button', { name: /좋아요$/ }).first()
    await likeBtn.click()
    await expect(page.getByRole('button', { name: /좋아요 취소/ })).toBeVisible({ timeout: 3000 })

    // Comment
    const textarea = page.locator('textarea').first()
    await textarea.fill('테스트 댓글')
    await page.getByRole('button', { name: '등록' }).click()
    await expect(page.getByText('테스트 댓글')).toBeVisible({ timeout: 3000 })

    // Bookmark + /saved
    const bookmarkBtn = page.getByRole('button', { name: '북마크에 추가' }).first()
    const bookmarkResp = page.waitForResponse(
      (r) => r.url().includes('/bookmark') && r.request().method() === 'POST' && r.ok(),
    )
    await bookmarkBtn.click()
    await bookmarkResp
    await expect(page.getByRole('button', { name: '북마크 취소' })).toBeVisible({ timeout: 3000 })
    await page.goto('/saved')
    await expect(page.locator('main a[href^="/detail/"]')).toHaveCount(1)

    // Mobile layout
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(href)
    await expect(page.getByRole('heading', { name: '세부정보' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: '댓글' })).toBeVisible({ timeout: 3000 })
  })
})
