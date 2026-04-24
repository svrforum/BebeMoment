'use client'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <html lang="ko">
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
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>문제가 발생했어요</h1>
          <p style={{ marginTop: '0.5rem', color: '#71717a' }}>
            잠시 후 다시 시도해주세요.
            {error.digest ? ` (${error.digest})` : ''}
          </p>
        </main>
      </body>
    </html>
  )
}
