import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'bebe-moment',
  description: '우리 아기의 모든 순간',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
