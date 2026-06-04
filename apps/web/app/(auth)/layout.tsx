import { BrandLockup } from '@/components/brand/brand-mark'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth')
  return (
    <div className="relative min-h-[100dvh] bg-base-50 dark:bg-base-950 md:grid md:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.3fr_1fr]">
      {/* Brand hero — desktop only */}
      <aside className="relative hidden overflow-hidden md:block">
        {/* Ambient gradients */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_900px_600px_at_20%_20%,oklch(0.75_0.2_245/.35),transparent_65%),radial-gradient(ellipse_800px_600px_at_85%_85%,oklch(0.82_0.14_330/.25),transparent_60%),radial-gradient(ellipse_500px_400px_at_90%_10%,oklch(0.88_0.15_85/.18),transparent_70%)]"
        />
        {/* Subtle grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px]"
        />
        {/* Content */}
        <div className="relative flex h-full min-h-[100dvh] flex-col justify-between p-12 xl:p-16">
          <BrandLockup iconClassName="h-10 w-10" textClassName="text-[18px]" />
          <div className="max-w-xl">
            <h2 className="text-balance font-bold leading-[1.05] tracking-tight text-base-900 dark:text-base-50 text-[clamp(2.5rem,4.2vw,4.25rem)]">
              {t('layout.hero.before')}
              <br />
              <span className="bg-gradient-to-br from-point-500 to-[oklch(0.72_0.2_330)] bg-clip-text text-transparent">
                {t('layout.hero.highlight')}
              </span>
              {t('layout.hero.after')}
              <br />
              {t('layout.hero.line3')}
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-base-600 dark:text-base-400">
              {t('layout.hero.tagline1')}
              <br />
              {t('layout.hero.tagline2')}
            </p>
          </div>
          <p className="text-xs text-base-500">{t('layout.hero.footer')}</p>
        </div>
      </aside>

      {/* Form side */}
      <section className="relative flex min-h-[100dvh] items-stretch md:items-center md:justify-center md:bg-base-0 dark:md:bg-base-900">
        <div className="w-full md:max-w-[520px] md:px-12 md:py-16 xl:px-16">{children}</div>
      </section>
    </div>
  )
}
