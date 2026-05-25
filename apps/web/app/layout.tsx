import { ThemeProvider } from '@/lib/theme'
import { themeInitScript } from '@/lib/theme-init-script'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'bebe-moment',
  description: '우리 아기의 모든 순간',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'bebe-moment',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script>{themeInitScript}</script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
