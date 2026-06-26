# Deployment — 일반 Linux Docker

## 요구 사항
- Docker 24+, Docker Compose v2
- 외부 리버스 프록시 (nginx, Caddy, Traefik) — TLS 종단용

## 빠른 시작

```bash
# 1. 디렉토리 준비
mkdir -p /opt/stacks/bebe-moment && cd /opt/stacks/bebe-moment

# 2. compose + env 다운로드
curl -fLO https://raw.githubusercontent.com/svrforum/bebe-moment/main/compose/docker-compose.yml
curl -fL https://raw.githubusercontent.com/svrforum/bebe-moment/main/compose/.env.example -o .env

# 3. .env 편집 — 시크릿은 모두 직접 생성한다 (예시/자리표시자 값은 프로덕션에서
#    부팅이 거부된다). 각각 서로 다른 새 랜덤값으로:  openssl rand -hex 32
nano .env
#   필수:
#     SECRET_KEY            세션 서명 + 저장 시크릿 암호화 키
#     POSTGRES_PASSWORD     postgres superuser 비밀번호
#     BEBE_WEB_DB_PASSWORD  / BEBE_MEDIA_DB_PASSWORD   (web/media DB 롤 — 안 주면 부팅 실패)
#     MEDIA_SERVICE_TOKEN   / MEDIA_JWT_SECRET          (미디어 내부 인증·서명, 각 32바이트+)
#     PUBLIC_URL            https://bebe.example.com  (HTTPS 권장 — 아래 참조)
#   선택:
#     ADMIN_USER_EMAIL      추가 인스턴스 관리자(쉼표 구분). 단, 첫 가입자가 곧 소유자=관리자라
#                           이 값과 일치할 필요는 없다(아래 첫 로그인 참조).

# 4. 기동
docker compose up -d

# 5. 첫 로그인 — 첫 가입자가 소유자(owner=관리자)가 된다
# PUBLIC_URL 접속 → /signup 으로 첫 계정 생성 → 로그인 후 /admin 접근 가능.
# (ADMIN_USER_EMAIL 과 일치시킬 필요 없음 — 첫 소유자가 자동으로 관리자)
```

## ⚠️ 공개 노출 전 확인

- **HTTPS 로 서비스하라.** 세션 쿠키는 `PUBLIC_URL` 이 `https://` 일 때만 `Secure` 로
  전송된다 — 인터넷에 노출하는 인스턴스는 반드시 TLS 리버스 프록시 뒤에 둔다.
- **postgres/redis 포트를 외부에 노출하지 마라.** 오직 app 의 3000 포트만(또는 프록시).
- **세팅을 끝낸 뒤 노출하라.** 첫 가입자가 소유자가 되므로, 공개 URL 에 먼저 접속한 사람이
  소유자를 선점할 수 있다. LAN/localhost 에서 먼저 첫 계정을 만들거나, `.env` 에
  `SETUP_TOKEN` 을 설정하고 `https://<host>/signup?setup=<값>` 으로 본인이 첫 계정을 만든다.

## 리버스 프록시 예시 (Caddy)

```
bebe.example.com {
  reverse_proxy localhost:3000
}
```

nginx 를 쓴다면 업로드/실시간 갱신(SSE)이 끊기지 않게 `proxy_buffering off;`,
넉넉한 `proxy_read_timeout`, `client_max_body_size`(영상 업로드 크기) 를 설정한다.

## 업그레이드

```bash
docker compose pull
docker compose up -d
```

## 백업

- `./data` — 업로드 원본 + 파생물 (주기적 백업 권장)
- `./pg` — Postgres 데이터 (`pg_dump` 또는 Hyper Backup 등)
- `./redis` — 임시 큐 (복구 불필요)

## 트러블슈팅

### 페이지가 500 / `MEDIA_SERVICE_TOKEN env required`
미디어를 부르는 페이지(타임라인·상세)가 500 나고 로그에 `MEDIA_SERVICE_TOKEN env required` 가 보이면, 컨테이너에 `MEDIA_SERVICE_TOKEN`·`MEDIA_JWT_SECRET` 가 안 들어간 것이다.
- 루트 `.env` 는 **gitignore 이자 dockerignore** 대상이라 이미지에 포함되지 않는다. 이 값들은 반드시 **런타임 env**(compose `environment:` / Synology Container Manager 환경변수)로 줘야 한다.
- `/api/health` 는 미디어를 안 거쳐 200 으로 남으므로 헬스체크만으론 못 잡는다 — 실제 사진 페이지로 확인할 것.

### 페이지는 뜨는데 사진이 안 뜸 (썸네일 깨짐)
서명 URL 이 노출되지 않은 포트(예: `:3001`)를 가리키는 경우다.
- 이 배포는 **포트 3000 하나만** 노출하고 브라우저는 `/media/*` Next rewrite 로 내부 미디어(`:3001`)에 접근한다.
- `MEDIA_PUBLIC_BASE_URL` / `NEXT_PUBLIC_MEDIA_BASE_URL` 을 **설정하지 말 것**(미설정 시 `PUBLIC_URL` 로 폴백되어 `/media/...` 가 동일 오리진으로 서빙된다). `:3001` 같은 값을 넣으면 브라우저가 닿지 못해 이미지가 깨진다.
