'use client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

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

const PRESETS: Preset[] = [
  {
    key: 'google',
    name: 'Google',
    issuer: 'https://accounts.google.com',
    scopes: ['openid', 'email', 'profile'],
    consoleLabel: 'Google Cloud Console 열기',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    color: 'from-[#EA4335] via-[#FBBC05] to-[#4285F4]',
    steps: (uri) => [
      {
        title: '1. OAuth 클라이언트 만들기',
        body: '콘솔 → 사용자 인증 정보 → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID" → 애플리케이션 유형 "웹 애플리케이션" 선택.',
      },
      {
        title: '2. 승인된 리디렉션 URI 등록',
        body: `아래 URI 를 복사해서 Google 콘솔의 "승인된 리디렉션 URI" 에 붙여넣기:\n${uri}`,
      },
      {
        title: '3. 클라이언트 ID / Secret 복사',
        body: '저장 후 나타나는 클라이언트 ID와 비밀번호를 복사해 아래 폼에 붙여넣고 저장하세요.',
      },
      {
        title: '4. 참고',
        body: 'Google 은 email_verified=true 가 기본이에요. 동일 이메일로 이미 가입된 계정이 있으면 자동으로 연결됩니다.',
      },
    ],
  },
  {
    key: 'kakao',
    name: '카카오',
    issuer: 'https://kauth.kakao.com',
    scopes: ['openid', 'profile_nickname', 'account_email'],
    consoleLabel: 'Kakao Developers 열기',
    consoleUrl: 'https://developers.kakao.com/console/app',
    color: 'from-[#FEE500] to-[#FEE500]',
    steps: (uri) => [
      {
        title: '1. 애플리케이션 추가',
        body: 'Kakao Developers → 내 애플리케이션 → 애플리케이션 추가하기. 저장 후 REST API 키를 기록해두세요.',
      },
      {
        title: '2. 플랫폼 등록',
        body: '앱 설정 → 플랫폼 → Web → 사이트 도메인에 현재 서비스 URL 등록.',
      },
      {
        title: '3. 카카오 로그인 활성화',
        body: `제품 → 카카오 로그인 → 활성화 설정 ON. Redirect URI 에 아래 값 등록:\n${uri}`,
      },
      {
        title: '4. 동의 항목 설정',
        body: 'openid · profile_nickname · account_email 을 필수 동의 항목으로 설정하세요. account_email 이 없으면 계정 연결 불가.',
      },
      {
        title: '5. Client Secret 생성',
        body: '보안 → Client Secret 코드 생성 → 사용 ON → 코드 복사. 아래 폼의 Client Secret 에 붙여넣기.',
      },
      {
        title: '6. Client ID',
        body: '앱 키 → REST API 키 값을 아래 폼의 Client ID 에 붙여넣기.',
      },
    ],
  },
  {
    key: 'naver',
    name: '네이버',
    issuer: '',
    kind: 'naver',
    scopes: [],
    consoleLabel: 'Naver Developers 열기',
    consoleUrl: 'https://developers.naver.com/apps/#/register',
    color: 'from-[#03C75A] to-[#03C75A]',
    steps: (uri) => [
      {
        title: '1. 애플리케이션 등록',
        body: 'Naver Developers → 애플리케이션 등록 → 사용 API "네이버 로그인" 선택.',
      },
      {
        title: '2. 제공 정보 선택',
        body: '회원이름·이메일 주소를 "필수"로 설정하세요. 이메일이 없으면 계정 연결이 제한돼요.',
      },
      {
        title: '3. 서비스 URL · Callback URL',
        body: `서비스 URL 에 현재 서비스 주소, Callback URL 에 아래 값을 등록:\n${uri}`,
      },
      {
        title: '4. Client ID / Secret',
        body: '발급된 Client ID 와 Client Secret 을 아래 폼에 붙여넣기. (네이버는 OAuth2 라 Issuer 불필요)',
      },
    ],
  },
  {
    key: 'microsoft',
    name: 'Microsoft',
    issuer: 'https://login.microsoftonline.com/common/v2.0',
    scopes: ['openid', 'email', 'profile'],
    consoleLabel: 'Azure Portal 열기',
    consoleUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    color: 'from-[#00A4EF] via-[#7FBA00] to-[#F25022]',
    steps: (uri) => [
      {
        title: '1. 앱 등록',
        body: 'Azure Portal → App Registrations → New Registration. 지원 계정 유형 선택.',
      },
      {
        title: '2. 리디렉션 URI 등록',
        body: `Platform: Web. URI 에 아래 값 입력:\n${uri}`,
      },
      {
        title: '3. Client Secret 생성',
        body: 'Certificates & secrets → New client secret → 값(Value) 복사 (창을 닫으면 다시 볼 수 없음).',
      },
      {
        title: '4. Client ID',
        body: 'Overview 화면의 "Application (client) ID" 를 복사.',
      },
      {
        title: '5. Optional: 이메일 클레임',
        body: '기본 테넌트는 email 클레임이 없을 수 있음. Token configuration → Optional claims → ID → email 추가 권장.',
      },
      {
        title: '6. 멀티테넌트 이슈어',
        body: '단일 테넌트만 허용하려면 Issuer 를 https://login.microsoftonline.com/<TENANT-ID>/v2.0 로 변경.',
      },
    ],
  },
  {
    key: 'custom',
    name: '기타 (OIDC)',
    issuer: '',
    scopes: ['openid', 'email', 'profile'],
    consoleLabel: '',
    consoleUrl: '',
    color: 'from-base-500 to-base-700',
    steps: (uri) => [
      {
        title: 'OpenID Connect 프로바이더',
        body: 'OIDC 규격 IdP (Keycloak, Authelia, Authentik, Dex 등) 면 연결 가능. issuer 는 보통 <IdP-URL>/realms/<realm> 형태.',
      },
      {
        title: 'Redirect URI',
        body: `IdP 콘솔의 Allowed Redirect URIs 에 아래 값 등록:\n${uri}`,
      },
      {
        title: '필수 클레임',
        body: 'id_token 에 sub, email, email_verified, name 포함 필요.',
      },
    ],
  },
]

export function NewProviderForm({ publicUrl }: { publicUrl: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<PresetKey | null>(null)
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState<string[]>(['openid', 'email', 'profile'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const redirectUri = useMemo(
    () => `${publicUrl.replace(/\/$/, '')}/api/auth/oidc/<저장 후 생성되는 UUID>/callback`,
    [publicUrl],
  )

  const preset = PRESETS.find((p) => p.key === selected) ?? null
  const kind = preset?.kind ?? 'oidc'

  function pickPreset(p: Preset) {
    setSelected(p.key)
    if (!name) setName(p.name)
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
      body: JSON.stringify({ name, kind, issuer, clientId, clientSecret, scopes }),
    })
    setSaving(false)
    if (r.ok) router.push('/admin/auth/providers')
    else {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? '저장 실패')
    }
  }

  const inputCls =
    'h-12 w-full rounded-2xl border border-transparent bg-base-100 px-4 text-[15px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      {/* Left: Provider picker + form */}
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-base-500">1. 프로바이더 선택</h2>
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
            <h2 className="mb-3 text-sm font-semibold text-base-500">2. 값 입력</h2>
            <label htmlFor="name" className="mb-2 block text-[13px] font-medium text-base-500">
              표시 이름
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
              placeholder="저장 시 암호화됨"
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-base-500">
              SECRET_KEY 로 AES-256-GCM 암호화되어 DB 에 저장됩니다.
            </p>
          </div>
          {error && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving || !selected} size="lg" className="w-full">
            {saving ? '저장 중…' : selected ? '추가' : '프로바이더를 먼저 선택하세요'}
          </Button>
        </form>
      </div>

      {/* Right: Guide panel */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-base-200 bg-base-0 p-5 dark:border-base-800 dark:bg-base-900">
          <h2 className="text-sm font-semibold text-base-500">Redirect URI</h2>
          <p className="mt-1 text-xs text-base-500">
            프로바이더 콘솔의 Redirect URIs 에 이 값을 등록하세요.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-base-100 p-3 font-mono text-xs dark:bg-base-800">
            <code className="flex-1 break-all">{redirectUri}</code>
            <button
              type="button"
              onClick={copyUri}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-0 text-base-700 shadow-sm transition hover:text-point-500 dark:bg-base-900 dark:text-base-300"
              title="복사"
            >
              {copied ? <Check size={14} className="text-point-500" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-base-500">
            저장 후 실제 UUID가 포함된 URI가 목록 화면에서 확인됩니다. 등록 시점엔 placeholder 로
            먼저 넣고, 저장 후 실제 값으로 교체하세요.
          </p>
        </div>

        {preset && (
          <div className="rounded-2xl border border-base-200 bg-base-0 p-5 dark:border-base-800 dark:bg-base-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{preset.name} 설정 가이드</h2>
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
            프로바이더를 선택하면 단계별 가이드가 여기에 표시됩니다.
          </div>
        )}

        <div className="rounded-2xl border border-base-200 bg-base-0 p-5 text-xs text-base-500 dark:border-base-800 dark:bg-base-900">
          <p className="font-semibold text-base-700 dark:text-base-300">보안 기능 (자동 적용)</p>
          <ul className="mt-2 space-y-1">
            <li>• id_token JWKS 검증 (jose)</li>
            <li>• iss · aud · exp · nonce · state 검증</li>
            <li>• email_verified=true 필수 (계정 탈취 방지)</li>
            <li>• Client Secret AES-256-GCM 암호화 저장</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
