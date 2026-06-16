'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function AuthSettingsPage() {
  const t = useTranslations('admin')

  return (
    <>
      <AppHeader title={t('auth.title')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        {/* 가입 정책은 토글로 끄고 켜는 게 아니라 모델상 고정 — 가족이 없을 때(첫 사용자)만
            공개 가입, 이후엔 초대 전용. 과거의 'auth.signup_enabled' 토글은 어떤 게이트도
            읽지 않는 무동작 컨트롤이라 제거하고, 실제 정책을 읽기전용 안내로 보여준다. */}
        <Card>
          <CardBody>
            <h3 className="font-medium">{t('auth.publicSignup')}</h3>
            <p className="text-xs text-base-500 mt-1">{t('auth.publicSignupHint')}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{t('auth.oidcProviders')}</h3>
              <p className="text-xs text-base-500">{t('auth.oidcProvidersHint')}</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/auth/providers">{t('auth.manage')}</Link>
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
