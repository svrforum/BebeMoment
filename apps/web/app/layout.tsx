import { prismaPublic } from '@/lib/db-init'
import { ThemeProvider } from '@/lib/theme'
import { type DefaultTheme, buildThemeInitScript } from '@/lib/theme-init-script'
import { getSetting } from '@/server/settings/get'
import type { Metadata, Viewport } from 'next'
import { z } from 'zod'
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

async function readDefaultTheme(): Promise<DefaultTheme> {
  try {
    return await getSetting(
      'appearance.default_theme',
      z.enum(['auto', 'light', 'dark']),
      'auto',
      prismaPublic,
    )
  } catch {
    // DB unavailable (e.g. build-time static prerender) — fall back to auto.
    return 'auto'
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const defaultTheme = await readDefaultTheme()
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script>{buildThemeInitScript(defaultTheme)}</script>
        <ThemeProvider defaultMode={defaultTheme}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
