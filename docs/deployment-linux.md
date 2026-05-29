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

# 3. .env 편집
nano .env
# SECRET_KEY, POSTGRES_PASSWORD, PUBLIC_URL, ADMIN_USER_EMAIL 필수
# MEDIA_SERVICE_TOKEN, MEDIA_JWT_SECRET (각 32바이트+) 도 필수 — 미디어 서비스 인증·서명 키
#   생성: openssl rand -hex 32

# 4. 기동
docker compose up -d

# 5. 첫 로그인
# PUBLIC_URL 접속 → /signup → ADMIN_USER_EMAIL 과 동일한 이메일로 가입
# → 로그인 후 /admin 접근 가능
```

## SECRET_KEY 생성

```bash
openssl rand -hex 32
```

## 리버스 프록시 예시 (Caddy)

```
bebe.example.com {
  reverse_proxy localhost:3000
}
```

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
