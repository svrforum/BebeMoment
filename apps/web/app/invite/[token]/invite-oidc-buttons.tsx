'use client'
import { SnsButton } from '@/components/auth/sns-brand'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/**
 * 초대 가입의 SNS 버튼 묶음. 입력한 닉네임을 OIDC start 링크의 `name` 파라미터로
 * 실어 보내면(콜백이 신규 유저 생성 시 표시 이름으로 사용), SNS 자동 이름 대신
 * 사용자가 고른 이름으로 가족에 합류한다. 비워두면 SNS 이름을 그대로 쓴다.
 */
export function InviteOidcButtons({
  token,
  providers,
}: {
  token: string
  providers: { id: string; name: string }[]
}) {
  const t = useTranslations('invite')
  const [name, setName] = useState('')
  const suffix = name.trim() ? `&name=${encodeURIComponent(name.trim())}` : ''

  return (
    <div className="mt-6 space-y-3">
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-base-200 dark:border-base-800" />
        <span className="mx-3 text-xs text-base-400">{t('oidc.divider')}</span>
        <div className="flex-grow border-t border-base-200 dark:border-base-800" />
      </div>

      <div className="space-y-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={t('oidc.namePlaceholder')}
          className="h-12 w-full rounded-2xl border border-base-200 bg-transparent px-4 text-sm text-base-900 placeholder:text-base-400 focus:border-point-500 focus:outline-none dark:border-base-800 dark:text-base-50"
        />
        <p className="px-1 text-[12px] text-base-400">{t('oidc.nameHint')}</p>
      </div>

      {providers.map((p) => (
        <SnsButton
          key={p.id}
          href={`/api/auth/oidc/${p.id}?invite=${token}`}
          name={p.name}
          suffix={suffix}
        />
      ))}
    </div>
  )
}
