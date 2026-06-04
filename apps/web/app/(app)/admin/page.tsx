import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

const sectionKeys = [
  'general',
  'features',
  'auth',
  'members',
  'smtp',
  'storage',
  'retention',
  'notifications',
  'backup',
  'system',
] as const

const sectionHrefs: Record<(typeof sectionKeys)[number], string> = {
  general: '/admin/general',
  features: '/admin/features',
  auth: '/admin/auth',
  members: '/admin/members',
  smtp: '/admin/smtp',
  storage: '/admin/storage',
  retention: '/admin/retention',
  notifications: '/admin/notifications',
  backup: '/admin/backup',
  system: '/admin/system',
}

export default function AdminPage() {
  const t = useTranslations('admin')
  return (
    <>
      <AppHeader title={t('home.title')} subtitle={t('home.subtitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
        {sectionKeys.map((key) => (
          <Button key={key} asChild variant="ghost" className="w-full h-auto">
            <Link href={sectionHrefs[key]} className="flex items-center justify-between py-3 px-4">
              <span className="flex-1 text-left">
                <span className="block font-medium">{t(`home.sections.${key}.label`)}</span>
                <span className="block text-xs text-base-500">
                  {t(`home.sections.${key}.description`)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-base-400" />
            </Link>
          </Button>
        ))}
      </div>
    </>
  )
}
