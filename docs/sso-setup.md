# SSO (OIDC) 설정 가이드

bebe-moment 는 OIDC 기반 SSO 를 관리자 UI 에서 설정할 수 있습니다. Google / 카카오 / Microsoft 등 OpenID Connect 규격 IdP 면 모두 연결됩니다.

## 준비

1. **관리자 계정** — `.env` 의 `ADMIN_USER_EMAIL` 에 본인 이메일 등록 + `email_verified=true`
2. **`PUBLIC_URL`** — 외부에서 접근 가능한 URL (로컬 테스트면 `http://localhost:3000`, 프로덕션이면 `https://bebe.example.com`)
3. **IdP OAuth 앱** — 해당 provider 콘솔에서 OAuth 2.0 / OIDC 앱 생성

## Redirect URI 패턴

```
{PUBLIC_URL}/api/auth/oidc/{provider-id}/callback
```

`provider-id` 는 관리자 UI 에서 provider 를 저장하면 자동 생성되는 UUID. 저장 후 URI 가 확정되면 IdP 콘솔에 등록.

순서: (1) 관리자 UI 에서 임시 저장 → (2) 생성된 ID 로 Redirect URI 계산 → (3) IdP 콘솔에 등록 → (4) 로그인 화면에서 동작 확인.

---

## Google

### Google Cloud Console

1. https://console.cloud.google.com/apis/credentials
2. **사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
3. 애플리케이션 유형: **웹 애플리케이션**
4. 승인된 리디렉션 URI: (provider 저장 후 등록 — 다음 섹션 참조)
5. **클라이언트 ID** + **클라이언트 보안 비밀번호** 복사

### bebe-moment 관리자 UI

1. `/admin/auth/providers` → **추가**
2. 필드:
   | Field | Value |
   |---|---|
   | Name | `Google` |
   | Issuer | `https://accounts.google.com` |
   | Client ID | (구글 콘솔에서 복사) |
   | Client Secret | (구글 콘솔에서 복사) |
   | Scopes | `openid email profile` (기본값 유지) |
3. 저장 → provider 목록에서 UUID 확인 (예: `a1b2c3...`)
4. 구글 콘솔로 돌아가서 승인된 리디렉션 URI 에 추가:
   ```
   http://localhost:3000/api/auth/oidc/a1b2c3.../callback
   ```
5. `/login` 에 "Google 으로 로그인" 버튼 자동 노출 확인

### 주의

- Google 은 **email_verified=true** 가 id_token 에 포함됨. 미인증 계정은 거부됨 (보안 기능).
- 동일 이메일로 이미 가입된 계정이 있으면 **자동 연결** (하이재킹 방지를 위해 이메일 검증된 경우만).

---

## 카카오

### Kakao Developers

1. https://developers.kakao.com/console/app → **애플리케이션 추가**
2. **플랫폼 → Web** → 사이트 도메인: `http://localhost:3000` (프로덕션은 실제 도메인)
3. **제품 → 카카오 로그인 → 활성화 설정 ON**
4. **Redirect URI** 등록 (provider 저장 후)
5. **동의 항목** → `openid`, `profile_nickname`, `account_email` 필수 동의 체크
6. **보안 → Client Secret** 생성 활성화 + 값 복사

### 관리자 UI

| Field | Value |
|---|---|
| Name | `카카오` |
| Issuer | `https://kauth.kakao.com` |
| Client ID | (REST API 키) |
| Client Secret | (보안에서 생성한 값) |
| Scopes | `openid profile_nickname account_email` |

---

## Microsoft (Azure AD / Entra ID)

### Azure Portal

1. **App Registrations** → **New registration**
2. 리디렉션 URI (Web): (provider 저장 후)
3. **Certificates & secrets** → **New client secret**
4. **Application (client) ID** + secret value 복사

### 관리자 UI

| Field | Value |
|---|---|
| Name | `Microsoft` |
| Issuer | `https://login.microsoftonline.com/common/v2.0` (multi-tenant) 또는 `https://login.microsoftonline.com/{tenant-id}/v2.0` |
| Client ID | Application (client) ID |
| Client Secret | 생성한 secret value |
| Scopes | `openid email profile` |

Entra ID 는 `email` 클레임이 기본으로 포함 안 될 때가 있음 — Azure 앱 등록에서 **Token configuration → Optional claims → email** 추가.

---

## 보안 기능 (이미 구현됨)

- **id_token JWKS 검증** — issuer 의 JWKS endpoint 에서 키 가져와 서명 검증 (jose library)
- **iss / aud / exp / nonce** 검증
- **state** CSRF 방어
- **email_verified=true** 필수 (P4 보안 강화)
- **Client Secret 암호화 저장** — DB 에는 AES-256-GCM 으로 암호화, `SECRET_KEY` 로 복호화
- **env lock** — `env` 로 prov 설정 고정 가능 (관리자 UI 잠금)

## 테스트

1. **시크릿 창**에서 `/login` 열기
2. Google 버튼 클릭 → IdP 동의 화면 → 돌아오면 자동 로그인
3. 처음이면 `/onboarding` 으로 이동, 가족 만들면 타임라인

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| "Invalid redirect URI" | IdP 콘솔의 URI 와 실제 요청 URI 불일치. `PUBLIC_URL` 확인 |
| "id_token signature invalid" | issuer 변경 후 JWKS 캐시 문제. 서버 재시작 |
| "email_verified must be true" | Google 은 기본 verified, 카카오는 사용자가 이메일 인증 안 한 경우. 동의 항목에 이메일 필수로 설정 |
| `/login` 에 버튼 안 보임 | provider `enabled=false`. 관리자 UI 에서 ON |
| 가입 후 로그인 해도 바로 로그아웃 | `SECRET_KEY` 가 바뀌어서 암호화된 secret 복호화 실패. env rotate 했으면 secret 재등록 |

## 관련 파일

- `/admin/auth/providers` — 관리 UI
- `apps/web/src/server/oidc/` — 서버 로직 (callback, verify 등)
- `apps/web/app/api/auth/oidc/[id]/` — OIDC 경로 (authorize/callback)
- `packages/db` — OidcProvider, OidcIdentity 모델
