'use client'
import { FamilyNavSection } from '@/components/family/family-nav-section'
import { PermissionsSection } from '@/components/family/permissions-section'
import { AppHeader } from '@/components/shell/app-header'
import { useTranslations } from 'next-intl'

export default function MembersPermissionsPage() {
  const t = useTranslations('admin')
  return (
    <>
      <AppHeader title={t('members.title')} subtitle={t('members.subtitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-4">
        <PermissionsSection />
        <FamilyNavSection />
      </div>
    </>
  )
}
