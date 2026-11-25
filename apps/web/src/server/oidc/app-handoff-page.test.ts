import { getServerTranslator } from '@/i18n/translator'
import { describe, expect, it } from 'vitest'
import { renderAppHandoffPage } from './app-handoff-page'

describe('renderAppHandoffPage', () => {
  const t = getServerTranslator('en', 'auth')

  it('opens the app through an intent URL, both automatically and from a tap', () => {
    const html = renderAppHandoffPage('abc_DEF-123', 'en', t)
    const intent = 'intent://auth?code=abc_DEF-123#Intent;scheme=bebe;package=im.bebe.app;end'
    expect(html).toContain(`<a href="${intent}"`)
    expect(html).toContain(`location.href=${JSON.stringify(intent)}`)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain(`<title>${t('oidcReturn.title')}</title>`)
    expect(html).toContain(t('oidcReturn.button'))
  })

  it('URL-encodes the code so it cannot break out of the link', () => {
    const html = renderAppHandoffPage('a"b<c', 'en', t)
    expect(html).toContain('code=a%22b%3Cc#Intent')
    expect(html).not.toContain('a"b<c')
  })
})
