'use client'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * 관리자용 Firebase(FCM) 설정 단계 안내. 안드로이드 앱 푸시를 켜려면 두 가지가
 * 필요하다: (1) 서버가 발송에 쓰는 서비스 계정 JSON(비밀), (2) 앱이 토큰 발급에
 * 쓰는 firebaseConfig(공개). 콘솔에서 각각 어디서 받아 어디에 붙여넣는지 정리.
 * 콘솔 UI 변동에 견디도록 "어느 메뉴" 수준으로 기술.
 */

const richTags = {
  b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  code: (chunks: React.ReactNode) => (
    <code className="rounded bg-base-100 px-1 dark:bg-base-800">{chunks}</code>
  ),
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-base-100 text-[11px] font-bold text-base-500 dark:bg-base-800 dark:text-base-300">
        {n}
      </span>
      <span className="flex-1 text-[13px] leading-relaxed text-base-700 dark:text-base-200">
        {children}
      </span>
    </li>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-2 text-[13px] font-semibold text-base-900 first:mt-0 dark:text-base-50">
      {children}
    </div>
  )
}

export function FirebaseSetupGuide() {
  const t = useTranslations('admin')
  return (
    <details className="group rounded-xl border border-base-200/70 bg-base-50/60 dark:border-base-800/70 dark:bg-base-800/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[13.5px] font-medium text-base-800 dark:text-base-100">
        <ChevronDown
          className="h-4 w-4 text-base-400 transition-transform group-open:rotate-180"
          strokeWidth={2}
        />
        {t('firebaseGuide.summary')}
      </summary>

      <div className="border-t border-base-200/70 px-4 py-3.5 dark:border-base-800/70">
        <p className="mb-3 text-[12.5px] leading-relaxed text-base-500">
          {t('firebaseGuide.intro')}
        </p>

        <a
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-point-500/10 px-3 py-1.5 text-[13px] font-medium text-point-600 transition-colors hover:bg-point-500/15 dark:text-point-300"
        >
          {t('firebaseGuide.openConsole')}
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
        </a>

        <GroupTitle>{t('firebaseGuide.group1Title')}</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>{t.rich('firebaseGuide.g1s1', richTags)}</Step>
          <Step n={2}>{t.rich('firebaseGuide.g1s2', richTags)}</Step>
        </ol>

        <GroupTitle>{t('firebaseGuide.group2Title')}</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>{t.rich('firebaseGuide.g2s1', richTags)}</Step>
          <Step n={2}>{t.rich('firebaseGuide.g2s2', richTags)}</Step>
          <Step n={3}>{t.rich('firebaseGuide.g2s3', richTags)}</Step>
          <Step n={4}>{t.rich('firebaseGuide.g2s4', richTags)}</Step>
        </ol>
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
          {t.rich('firebaseGuide.secretWarning', richTags)}
        </p>

        <GroupTitle>{t('firebaseGuide.group3Title')}</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>{t.rich('firebaseGuide.g3s1', richTags)}</Step>
          <Step n={2}>
            {t.rich('firebaseGuide.g3s2', {
              ...richTags,
              pkg: () => (
                <code className="rounded bg-base-100 px-1 dark:bg-base-800">im.bebe.app</code>
              ),
            })}
          </Step>
          <Step n={3}>
            {t.rich('firebaseGuide.g3s3', richTags)}
            <ul className="mt-1.5 space-y-1 text-[12.5px]">
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">apiKey</code> ={' '}
                <code className="text-[11px]">client[0].api_key[0].current_key</code>
              </li>
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">appId</code> ={' '}
                <code className="text-[11px]">client[0].client_info.mobilesdk_app_id</code>{' '}
                (1:…:android:…)
              </li>
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">projectId</code> ={' '}
                <code className="text-[11px]">project_info.project_id</code>
              </li>
              <li>
                •{' '}
                <code className="rounded bg-base-100 px-1 dark:bg-base-800">messagingSenderId</code>{' '}
                = <code className="text-[11px]">project_info.project_number</code>
              </li>
            </ul>
          </Step>
          <Step n={4}>
            {t.rich('firebaseGuide.g3s4', richTags)}
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-base-900 px-3 py-2 text-[11px] leading-relaxed text-base-100 dark:bg-base-950">{`{
  "apiKey": "AIza…",
  "appId": "1:1234567890:android:abcd…",
  "projectId": "bebe-xxxxx",
  "messagingSenderId": "1234567890"
}`}</pre>
          </Step>
        </ol>

        <GroupTitle>{t('firebaseGuide.group4Title')}</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>{t.rich('firebaseGuide.g4s1', richTags)}</Step>
          <Step n={2}>{t.rich('firebaseGuide.g4s2', richTags)}</Step>
        </ol>
      </div>
    </details>
  )
}
