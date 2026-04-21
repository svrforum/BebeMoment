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
