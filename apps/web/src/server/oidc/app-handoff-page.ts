import type { Locale } from '@/i18n/locales'
import type { ServerT } from '@/i18n/translator'

// 앱(Custom Tab) 로그인 마무리 페이지. 크롬 Custom Tab 은 서버가 bebe:// 로 그냥 리다이렉트하면
// 앱을 띄우지 않는다(보안) — 패키지를 지정한 intent:// 로 자동 실행하고, 막히면 사용자가 누를
// 버튼(제스처)을 둔다. code 는 1회용 핸드오프 코드라 앱이 verifier 와 함께 교환한다.
export function renderAppHandoffPage(code: string, locale: Locale, t: ServerT): string {
  const intentUrl = `intent://auth?code=${encodeURIComponent(code)}#Intent;scheme=bebe;package=im.bebe.app;end`
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('oidcReturn.title')}</title></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100dvh;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:32px;text-align:center;color:#111">
<p style="font-size:16px;margin:0">${t('oidcReturn.message')}</p>
<a href="${intentUrl}" style="display:inline-block;background:#111;color:#fff;padding:15px 30px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px">${t('oidcReturn.button')}</a>
<script>setTimeout(function(){location.href=${JSON.stringify(intentUrl)}},250)</script>
</body></html>`
}
