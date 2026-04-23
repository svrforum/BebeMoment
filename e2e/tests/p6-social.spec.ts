import { expect, test } from '@playwright/test'

test.describe('P6 social smoke', () => {
  test('like + comment + bookmark + detail view', async ({ page }) => {
    const uniq = Date.now()
    const email = `p6-${uniq}@test.local`

    await page.goto('/signup')
    await page.locator('input#displayName').fill('P6 User')
    await page.locator('input#email').fill(email)
    await page.locator('input#password').fill('password123')
    await Promise.all([
      page.waitForURL(/\/onboarding$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /가입하기/ }).click(),
    ])
    await page.locator('input#familyName').fill(`P6 Family ${uniq}`)
    await page.locator('input#babyName').fill('P6 Baby')
    await page.locator('input#birthDate').fill('2026-01-01')
    await Promise.all([
      page.waitForURL(/\/timeline$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /시작하기/ }).click(),
    ])

    // Upload a JPEG
    const sharp = (await import('sharp')).default
    const jpeg = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer()

    const fab = page.locator('button[aria-label="업로드"]').first()
    await fab.click()
    await expect(page.getByText(/사진 · 영상 올리기/)).toBeVisible({ timeout: 5000 })
    await page.evaluate(
      async ({ bytes, name }) => {
        type UppyHandle = {
          addFile: (f: { name: string; type: string; data: Blob }) => unknown
          upload: () => Promise<unknown>
        }
        const uppy = (window as unknown as { __uppy?: UppyHandle }).__uppy
        if (!uppy) throw new Error('uppy missing')
        uppy.addFile({ name, type: 'image/jpeg', data: new Blob([new Uint8Array(bytes)]) })
        await uppy.upload()
      },
      { bytes: Array.from(jpeg), name: `p6-${uniq}.jpg` },
    )
    await page.keyboard.press('Escape')

    // Poll for thumbnail
    await page.goto('/timeline')
    for (let i = 0; i < 10; i++) {
      await page.reload()
      if ((await page.locator('main a[href^="/detail/"]').count()) >= 1) break
      await page.waitForTimeout(2000)
    }
    const detailLink = page.locator('main a[href^="/detail/"]').first()
    const href = await detailLink.getAttribute('href')
    expect(href).toMatch(/^\/detail\/[0-9a-f-]+$/)
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
    const bookmarkBtn = page.getByRole('button', { name: '저장함에 추가' }).first()
    await bookmarkBtn.click()
    await expect(page.getByRole('button', { name: '저장 취소' })).toBeVisible({ timeout: 3000 })
    await page.goto('/saved')
    await expect(page.locator('main a[href^="/detail/"]')).toHaveCount(1)

    // Mobile layout
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(href!)
    await expect(page.getByRole('heading', { name: '세부정보' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: '댓글' })).toBeVisible({ timeout: 3000 })
  })
})
