'use client'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // 루트 레이아웃이 깨진 최후 폴백이라 i18n 프로바이더가 없다 — 로케일을 알 수 없어
  // 한/영 병기로 둔다(특정 언어에 갇히지 않게).
  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', color: '#71717a' }}>
            문제가 발생했어요 · Please try again in a moment.
            {error.digest ? ` (${error.digest})` : ''}
          </p>
        </main>
      </body>
    </html>
  )
}
