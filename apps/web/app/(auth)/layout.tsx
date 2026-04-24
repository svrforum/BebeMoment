import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-base-50 md:grid md:grid-cols-[1.1fr_1fr] lg:grid-cols-[1.25fr_1fr]">
      {/* Brand hero — desktop only */}
      <aside className="relative hidden overflow-hidden md:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.72_0.18_245/.25),transparent_60%),radial-gradient(ellipse_at_bottom_right,oklch(0.82_0.14_320/.2),transparent_55%)] bg-base-50" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,theme(colors.base-50))] dark:bg-[linear-gradient(180deg,transparent,theme(colors.base-50))]" />
        <div className="relative flex h-full min-h-[100dvh] flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-point-500 text-white">
              b
            </span>
            <span>
              bebe<span className="text-point-500">·</span>moment
            </span>
          </div>
          <div className="max-w-lg">
            <h2 className="text-balance text-[clamp(2rem,3.2vw,3rem)] font-bold leading-tight tracking-tight">
              우리 아기의 모든 순간을,
              <br />
              가족과 함께.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-base-600 dark:text-base-400">
              사진·영상·성장·마일스톤·일기를 한 곳에.
              <br />
              원본 그대로 안전하게 보관하고, 가족과 실시간으로 나눠요.
            </p>
          </div>
          <p className="text-xs text-base-500">Self-hosted · 오픈소스 · 가족 단위 격리</p>
        </div>
      </aside>

      {/* Form side — always visible */}
      <section className="relative flex min-h-[100dvh] items-stretch md:items-center md:justify-center">
        <div className="w-full md:max-w-[440px] md:rounded-3xl md:border md:border-base-200 md:bg-base-0 md:p-10 md:shadow-[0_30px_60px_-30px_oklch(0.2_0_0/0.15)] dark:md:border-base-800 dark:md:bg-base-900">
          {children}
        </div>
      </section>
    </div>
  )
}
