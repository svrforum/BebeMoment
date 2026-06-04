import { AppHeader } from '@/components/shell/app-header'
import { parseEnv } from '@bebe/config'
import { getTranslations } from 'next-intl/server'
import { NewProviderForm } from './new-provider-form'

export const dynamic = 'force-dynamic'

export default async function NewProviderPage() {
  const t = await getTranslations('admin')
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const publicUrl = env.PUBLIC_URL

  return (
    <>
      <AppHeader title={t('auth.addTitle')} />
      <div className="mx-auto max-w-5xl px-5 py-4">
        <NewProviderForm publicUrl={publicUrl} />
      </div>
    </>
  )
}
