import { prismaPublic } from '@/lib/db-init'
import { ThemeProvider } from '@/lib/theme'
import { type DefaultTheme, buildThemeInitScript } from '@/lib/theme-init-script'
import { getSetting } from '@/server/settings/get'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { preload } from 'react-dom'
import { z } from 'zod'
import './globals.css'

// 92개 서브셋 중 첫 화면이 거의 항상 쓰는 둘만 미리 받는다 — 91 은 기본 라틴 + 가장 흔한
// 한글 음절, 90 은 그다음으로 흔한 음절. 나머지는 CSS 의 unicode-range 가 필요할 때 부른다.
const PRELOADED_FONT_SUBSETS = [91, 90] as const

export const metadata: Metadata = {
  title: 'Bebe Moment',
  description: '우리 아기의 모든 순간',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Bebe Moment',
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
      'light',
      prismaPublic,
    )
  } catch {
    // DB unavailable (e.g. build-time static prerender) — light mode default.
    return 'light'
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const defaultTheme = await readDefaultTheme()
  const locale = await getLocale()
  const messages = await getMessages()
  for (const n of PRELOADED_FONT_SUBSETS) {
    preload(`/fonts/pretendard/PretendardVariable.subset.${n}.woff2`, {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    })
  }
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <script>{buildThemeInitScript(defaultTheme)}</script>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider defaultMode={defaultTheme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
