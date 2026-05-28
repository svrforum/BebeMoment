'use client'
import { PermissionsSection } from '@/components/family/permissions-section'
import { AppHeader } from '@/components/shell/app-header'

export default function MembersPermissionsPage() {
  return (
    <>
      <AppHeader title="구성원 권한" subtitle="가족 구성원이 할 수 있는 작업" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <PermissionsSection />
      </div>
    </>
  )
}
