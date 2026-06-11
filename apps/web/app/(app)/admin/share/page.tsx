'use client'
import { ShareLinksSection } from '@/components/admin/share-links-section'
import { AppHeader } from '@/components/shell/app-header'
import { useTranslations } from 'next-intl'

export default function ShareLinksAdminPage() {
  const t = useTranslations('admin')
  return (
    <>
      <AppHeader title={t('share.title')} subtitle={t('share.subtitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <ShareLinksSection />
      </div>
    </>
  )
}
