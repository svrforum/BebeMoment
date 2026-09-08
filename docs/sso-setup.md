# SSO (OIDC) 설정 가이드

소셜/SSO 로그인은 **관리자 UI 에서** 붙입니다: `/admin/auth/providers` → **추가**. 프로바이더를
고르면 그 화면에 콘솔 링크·단계별 안내·복사용 Redirect URI 가 함께 뜨므로, 이 문서는 어디서
무엇이 결정되는지만 짧게 정리합니다.

## 준비

- **관리자 권한** — 첫 가입자(가족 `owner`)가 곧 관리자입니다. `.env` 의 `ADMIN_USER_EMAIL`
  로 관리자를 더 둘 수 있지만, 이 목록은 **OIDC 로 검증된 이메일**(IdP 가 `email_verified=true`
  로 준 계정)에만 적용됩니다. 아이디/비밀번호로 가입한 계정의 이메일은 미검증이라 매칭되지
  않습니다 — 그런 계정에 관리자를 주려면 owner 로 두는 수밖에 없습니다.
- **`PUBLIC_URL`** — 외부에서 접근하는 URL. Redirect URI 가 여기서 계산됩니다.
- **IdP 콘솔의 OAuth 앱** — 아래 표의 링크로 이동해 만들고, Client ID / Secret 을 복사합니다.

## 지원 프로바이더

| 프로바이더 | 방식 | 비고 |
|---|---|---|
| Google | OIDC | `email_verified` 를 기본 제공. 같은 이메일의 기존 계정에 자동 연결. |
| 카카오 | OIDC | 카카오 로그인 **과** OpenID Connect 활성화를 둘 다 켜야 합니다. 이메일(`account_email`) 동의항목은 비즈앱 심사가 필요해 기본 제외 — 닉네임만으로 가입됩니다. |
| 네이버 | OAuth2 | OIDC 가 아니라 Issuer 가 없습니다. 제공 정보에서 회원이름·이메일을 "필수"로 두세요. |
| Microsoft (Entra ID) | OIDC | 기본 테넌트는 `email` 클레임이 없을 수 있습니다 — Token configuration → Optional claims → email. 단일 테넌트만 허용하려면 Issuer 를 `https://login.microsoftonline.com/<TENANT-ID>/v2.0` 로. |
| 기타 (OIDC) | OIDC | Keycloak · Authelia · Authentik · Dex 등 규격 IdP. id_token 에 `sub`, `email`, `email_verified`, `name` 이 있어야 합니다. |

## 순서

1. `/admin/auth/providers` → **추가** → 프로바이더 선택.
2. 화면의 안내대로 IdP 콘솔에서 앱을 만들고 **Redirect URI** 를 등록합니다:
   ```
   {PUBLIC_URL}/api/auth/oidc/{provider-id}/callback
   ```
   `provider-id` 는 저장 시 정해지며 화면에 복사 버튼과 함께 표시됩니다. 저장 전후로 값이
   바뀌지 않습니다.
3. Client ID / Secret(그리고 OIDC 면 Issuer, 필요하면 Scope)을 입력하고 저장 → **활성**.
4. 시크릿 창에서 `/login` 을 열어 버튼이 보이는지, 로그인이 도는지 확인합니다.

## 누가 OIDC 로 들어올 수 있나

- **이미 있는 계정**: OIDC 아이덴티티가 연결된 계정, 또는 IdP 가 검증된 이메일을 주고 그
  이메일의 기존 계정도 검증된 경우 자동 연결됩니다(양쪽 다 검증된 경우에만 — 계정 탈취 방지).
  로그인한 상태에서 설정 → 계정에서 직접 연결할 수도 있습니다.
- **새 사용자**: 인스턴스에 가족이 이미 있으면(닫힌 인스턴스) **초대 링크로만** 들어올 수
  있습니다. 초대받은 사람은 `/invite/<token>` 페이지에서 OIDC 버튼을 눌러야 합니다 — 그 경로가
  초대 토큰을 쿠키로 넘기고, 콜백이 가입과 가족 합류를 함께 처리합니다. 초대 없이 `/login`
  의 버튼으로 새 계정을 만들려 하면 `/login?error=invite_required` 로 거부됩니다.
- **첫 소유자**: 가족이 아직 없으면 OIDC 로도 첫 계정을 만들 수 있습니다. 단 `SETUP_TOKEN`
  을 둔 인스턴스에선 OIDC 가 토큰을 전달할 수 없어 `error=setup_required` 로 막힙니다 —
  첫 소유자는 `/signup?setup=<토큰>` 아이디 가입으로 만든 뒤, 그 계정에 OIDC 를 연결하세요.
- 정지된 계정은 OIDC 로도 로그인되지 않습니다(`error=suspended`).

## 보안 (자동 적용)

- id_token 을 issuer 의 JWKS 로 서명 검증 — 비대칭 알고리즘만 허용(`alg=none`/HS 계열 거부)
- `iss` · `aud` · `exp` · `nonce` 검증, `state` 로 CSRF 방어
- 이메일 기반 계정 연결은 `email_verified=true` 인 경우에만
- Client Secret 은 `SECRET_KEY` 로 AES-256-GCM 암호화해 저장 — `SECRET_KEY` 를 바꾸면 다시
  입력해야 합니다([operations.md](operations.md) "SECRET_KEY rotation")
- IdP 로 나가는 요청(discovery · JWKS · token · userinfo)은 사설/루프백 주소를 막습니다. LAN
  의 자체 IdP(Keycloak 등)를 쓰면 컨테이너 env 에 `OIDC_ALLOW_LOCAL_FETCH=true` 를 둡니다.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| "Invalid redirect URI" | IdP 콘솔의 URI 와 실제 요청 URI 불일치. `PUBLIC_URL` 과 관리자 화면의 URI 를 그대로 등록했는지 확인 |
| `/login?error=invite_required` | 닫힌 인스턴스에 초대 없이 새 계정을 만들려 함. 관리자에게 초대 링크를 받아 그 페이지의 버튼으로 로그인 |
| `/login?error=setup_required` | `SETUP_TOKEN` 이 설정된 인스턴스의 첫 가입을 OIDC 로 시도. 아이디 가입(`/signup?setup=…`)으로 첫 계정을 만든 뒤 연결 |
| `/settings?error=link_conflict` | 이 OIDC 아이덴티티가 이미 다른 계정에 연결돼 있음 |
| "id_token signature invalid" | issuer 변경 후 JWKS 캐시 문제 — 컨테이너 재시작 |
| discovery 가 실패하고 로그에 blocked/private address | IdP 가 LAN 주소. `OIDC_ALLOW_LOCAL_FETCH=true` |
| `/login` 에 버튼 안 보임 | 프로바이더가 비활성. 관리자 화면에서 **켜기** |
| 저장한 프로바이더로 로그인이 갑자기 안 됨 | `SECRET_KEY` 가 바뀌어 암호화된 secret 을 못 읽음. Client Secret 재입력 |
| 카카오 가입에 이메일이 없음 | `account_email` 동의항목은 비즈앱 심사 필요. 없어도 닉네임으로 가입되며, 이메일 기반 자동 연결만 안 됨 |

## 관련 파일

- `/admin/auth/providers` — 관리 UI (`apps/web/app/(app)/admin/auth/`)
- `apps/web/src/server/oidc/` — discovery · callback 검증 · 계정 연결 · 네이버 OAuth2
- `apps/web/app/api/auth/oidc/[providerId]/` — 시작/콜백 라우트
- `packages/db-public` — `OidcProvider`, `OidcIdentity` 모델
