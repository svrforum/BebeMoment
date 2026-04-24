import { AppHeader } from '@/components/shell/app-header'
import { parseEnv } from '@bebe/config'
import { NewProviderForm } from './new-provider-form'

export const dynamic = 'force-dynamic'

export default function NewProviderPage() {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const publicUrl = env.PUBLIC_URL

  return (
    <>
      <AppHeader title="OIDC 추가" />
      <div className="mx-auto max-w-5xl px-5 py-4">
        <NewProviderForm publicUrl={publicUrl} />
      </div>
    </>
  )
}
