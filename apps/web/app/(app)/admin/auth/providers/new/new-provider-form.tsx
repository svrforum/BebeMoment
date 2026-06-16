'use client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type PresetKey = 'google' | 'kakao' | 'naver' | 'microsoft' | 'custom'

type Preset = {
  key: PresetKey
  name: string
  issuer: string
  scopes: string[]
  // 'naver' = OAuth2 전용(issuer/discovery 불필요). 생략 시 표준 OIDC.
  kind?: 'oidc' | 'naver'
  consoleLabel: string
  consoleUrl: string
  color: string
  steps: (redirectUri: string) => { title: string; body: string }[]
}

type TFn = (key: string, values?: Record<string, string>) => string

function buildPresets(t: TFn): Preset[] {
  return [
    {
      key: 'google',
      name: 'Google',
      issuer: 'https://accounts.google.com',
      scopes: ['openid', 'email', 'profile'],
      consoleLabel: t('auth.googleConsole'),
      consoleUrl: 'https://console.cloud.google.com/apis/credentials',
      color: 'from-[#EA4335] via-[#FBBC05] to-[#4285F4]',
      steps: (uri) => [
        { title: t('auth.googleStep1Title'), body: t('auth.googleStep1Body') },
        { title: t('auth.googleStep2Title'), body: t('auth.googleStep2Body', { uri }) },
        { title: t('auth.googleStep3Title'), body: t('auth.googleStep3Body') },
        { title: t('auth.googleStep4Title'), body: t('auth.googleStep4Body') },
      ],
    },
    {
      key: 'kakao',
      name: t('auth.kakaoName'),
      issuer: 'https://kauth.kakao.com',
      scopes: ['openid', 'profile_nickname'],
      consoleLabel: t('auth.kakaoConsole'),
      consoleUrl: 'https://developers.kakao.com/console/app',
      color: 'from-[#FEE500] to-[#FEE500]',
      steps: (uri) => [
        { title: t('auth.kakaoStep1Title'), body: t('auth.kakaoStep1Body') },
        { title: t('auth.kakaoStep2Title'), body: t('auth.kakaoStep2Body') },
        { title: t('auth.kakaoStep3Title'), body: t('auth.kakaoStep3Body', { uri }) },
        { title: t('auth.kakaoStep4Title'), body: t('auth.kakaoStep4Body') },
        { title: t('auth.kakaoStep5Title'), body: t('auth.kakaoStep5Body') },
        { title: t('auth.kakaoStep6Title'), body: t('auth.kakaoStep6Body') },
      ],
    },
    {
      key: 'naver',
      name: t('auth.naverName'),
      issuer: '',
      kind: 'naver',
      scopes: [],
      consoleLabel: t('auth.naverConsole'),
      consoleUrl: 'https://developers.naver.com/apps/#/register',
      color: 'from-[#03C75A] to-[#03C75A]',
      steps: (uri) => [
        { title: t('auth.naverStep1Title'), body: t('auth.naverStep1Body') },
        { title: t('auth.naverStep2Title'), body: t('auth.naverStep2Body') },
        { title: t('auth.naverStep3Title'), body: t('auth.naverStep3Body', { uri }) },
        { title: t('auth.naverStep4Title'), body: t('auth.naverStep4Body') },
      ],
    },
    {
      key: 'microsoft',
      name: 'Microsoft',
      issuer: 'https://login.microsoftonline.com/common/v2.0',
      scopes: ['openid', 'email', 'profile'],
      consoleLabel: t('auth.microsoftConsole'),
      consoleUrl:
        'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
      color: 'from-[#00A4EF] via-[#7FBA00] to-[#F25022]',
      steps: (uri) => [
        { title: t('auth.microsoftStep1Title'), body: t('auth.microsoftStep1Body') },
        { title: t('auth.microsoftStep2Title'), body: t('auth.microsoftStep2Body', { uri }) },
        { title: t('auth.microsoftStep3Title'), body: t('auth.microsoftStep3Body') },
        { title: t('auth.microsoftStep4Title'), body: t('auth.microsoftStep4Body') },
        { title: t('auth.microsoftStep5Title'), body: t('auth.microsoftStep5Body') },
        { title: t('auth.microsoftStep6Title'), body: t('auth.microsoftStep6Body') },
      ],
    },
    {
      key: 'custom',
      name: t('auth.customName'),
      issuer: '',
      scopes: ['openid', 'email', 'profile'],
      consoleLabel: '',
      consoleUrl: '',
      color: 'from-base-500 to-base-700',
      steps: (uri) => [
        { title: t('auth.customStep1Title'), body: t('auth.customStep1Body') },
        { title: t('auth.customStep2Title'), body: t('auth.customStep2Body', { uri }) },
        { title: t('auth.customStep3Title'), body: t('auth.customStep3Body') },
      ],
    },
  ]
}

// secure context 불필요한 RFC4122 v4 (crypto.getRandomValues 는 HTTP 에서도 동작).
function uuidv4(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  const h: string[] = []
  for (let i = 0; i < 16; i++) {
    let v = b[i] ?? 0
    if (i === 6) v = (v & 0x0f) | 0x40
    if (i === 8) v = (v & 0x3f) | 0x80
    h.push(v.toString(16).padStart(2, '0'))
  }
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}

export function NewProviderForm({ publicUrl }: { publicUrl: string }) {
  const t = useTranslations('admin')
  const router = useRouter()
  const PRESETS = useMemo(() => buildPresets(t), [t])
  const [selected, setSelected] = useState<PresetKey | null>(null)
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState<string[]>(['openid', 'email', 'profile'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // provider UUID 를 저장 전에 미리 생성해 콜백 주소에 박는다 — 저장 시 이 id 로 생성되므로
  // Redirect URI 는 곧 최종값이다. ⚠️ SSR 에서 생성하면(useState(uuidv4)) 서버·클라 값이 달라
  // Redirect URI 텍스트가 하이드레이션 불일치(React #418)를 낸다 → 초기값을 양쪽 동일하게 두고
  // mount 후 채운다(origin 과 동일 패턴). crypto.randomUUID 는 secure context 전용이라 v4 직접 생성.
  const [providerId, setProviderId] = useState('')
  // 지금 접속한 오리진(도메인) 기준 콜백 주소 — 서버도 요청 오리진을 redirect_uri 로 쓴다.
  const [origin, setOrigin] = useState(publicUrl.replace(/\/$/, ''))
  useEffect(() => {
    setProviderId(uuidv4())
    setOrigin(window.location.origin)
  }, [])
  const redirectUri = useMemo(
    () => `${origin}/api/auth/oidc/${providerId}/callback`,
    [origin, providerId],
  )

  const preset = PRESETS.find((p) => p.key === selected) ?? null
  const kind = preset?.kind ?? 'oidc'

  function pickPreset(p: Preset) {
    setSelected(p.key)
    setName(p.name)
    setIssuer(p.issuer)
    setScopes(p.scopes)
    setError(null)
  }

  async function copyUri() {
    await navigator.clipboard.writeText(redirectUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const r = await fetch('/api/admin/oidc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: providerId, name, kind, issuer, clientId, clientSecret, scopes }),
    })
    setSaving(false)
    if (r.ok) router.push('/admin/auth/providers')
    else {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? t('auth.saveFailed'))
    }
  }

  const inputCls =
    'h-12 w-full rounded-2xl border border-transparent bg-base-100 px-4 text-[15px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      {/* Left: Provider picker + form */}
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-base-500">{t('auth.step1Pick')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => pickPreset(p)}
                className={cn(
                  'relative overflow-hidden rounded-2xl border p-4 text-left transition',
                  selected === p.key
                    ? 'border-point-500 bg-point-500/5 ring-4 ring-point-500/15'
                    : 'border-base-200 hover:border-base-300 dark:border-base-800 dark:hover:border-base-700',
                )}
              >
                <div className={cn('mb-3 h-1.5 w-10 rounded-full bg-gradient-to-r', p.color)} />
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 truncate text-xs text-base-500">
                  {p.issuer || 'Custom OIDC'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-base-500">{t('auth.step2Values')}</h2>
            <label htmlFor="name" className="mb-2 block text-[13px] font-medium text-base-500">
              {t('auth.displayName')}
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Google"
              className={inputCls}
            />
          </div>
          {kind !== 'naver' && (
            <div>
              <label htmlFor="issuer" className="mb-2 block text-[13px] font-medium text-base-500">
                Issuer URL
              </label>
              <input
                id="issuer"
                type="url"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                required
                placeholder="https://accounts.google.com"
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label htmlFor="clientId" className="mb-2 block text-[13px] font-medium text-base-500">
              Client ID
            </label>
            <input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="clientSecret"
              className="mb-2 block text-[13px] font-medium text-base-500"
            >
              Client Secret
            </label>
            <input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required
              placeholder={t('auth.clientSecretEncryptedPlaceholder')}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-base-500">{t('auth.clientSecretEncryptedHint')}</p>
          </div>
          {error && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving || !selected} size="lg" className="w-full">
            {saving ? t('auth.saving') : selected ? t('auth.add') : t('auth.pickFirst')}
          </Button>
        </form>
      </div>

      {/* Right: Guide panel */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-base-200 bg-base-0 p-5 dark:border-base-800 dark:bg-base-900">
          <h2 className="text-sm font-semibold text-base-500">Redirect URI</h2>
          <p className="mt-1 text-xs text-base-500">{t('auth.redirectUriHint')}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-base-100 p-3 font-mono text-xs dark:bg-base-800">
            <code className="flex-1 break-all">{redirectUri}</code>
            <button
              type="button"
              onClick={copyUri}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-0 text-base-700 shadow-sm transition hover:text-point-500 dark:bg-base-900 dark:text-base-300"
              title={t('auth.copy')}
            >
              {copied ? <Check size={14} className="text-point-500" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-base-500">{t('auth.redirectUriNote')}</p>
        </div>

        {preset && (
          <div className="rounded-2xl border border-base-200 bg-base-0 p-5 dark:border-base-800 dark:bg-base-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t('auth.setupGuide', { name: preset.name })}
              </h2>
              {preset.consoleUrl && (
                <a
                  href={preset.consoleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-point-500 hover:underline"
                >
                  {preset.consoleLabel}
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            <ol className="mt-4 space-y-4">
              {preset.steps(redirectUri).map((step) => (
                <li key={step.title} className="text-sm">
                  <div className="font-semibold text-base-900 dark:text-base-50">{step.title}</div>
                  <p className="mt-1 whitespace-pre-wrap text-base-600 dark:text-base-400">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {!preset && (
          <div className="rounded-2xl border border-dashed border-base-300 p-5 text-center text-sm text-base-500 dark:border-base-700">
            {t('auth.guidePlaceholder')}
          </div>
        )}

        <div className="rounded-2xl border border-base-200 bg-base-0 p-5 text-xs text-base-500 dark:border-base-800 dark:bg-base-900">
          <p className="font-semibold text-base-700 dark:text-base-300">
            {t('auth.securityTitle')}
          </p>
          <ul className="mt-2 space-y-1">
            <li>• {t('auth.securityJwks')}</li>
            <li>• {t('auth.securityClaims')}</li>
            <li>• {t('auth.securityEmailVerified')}</li>
            <li>• {t('auth.securityEncryption')}</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
