# Deployment — Synology DSM

## 요구 사항
- DSM 7.2+
- Container Manager 패키지 설치
- 공유 폴더: `docker` (또는 원하는 이름)

## 설치

1. **DSM → Container Manager → 프로젝트 → 만들기**
2. **프로젝트 이름**: `bebe-moment`
3. **경로**: `/volume1/docker/bebe-moment`
4. **소스**: `docker-compose.yml 만들기`
5. **docker-compose.yml 내용 붙여넣기**: 아래 병합본 참고

### `docker-compose.yml` (Synology)

```yaml
services:
  web:
    image: ghcr.io/svrforum/bebe-moment/web:latest
    environment:
      DATABASE_URL: postgres://bebe:${POSTGRES_PASSWORD}@postgres:5432/bebe
      REDIS_URL: redis://redis:6379
      SECRET_KEY: ${SECRET_KEY}
      PUBLIC_URL: ${PUBLIC_URL}
      STORAGE_MODE: local
      STORAGE_PATH: /data
      PUID: "1026"
      PGID: "100"
      ADMIN_USER_EMAIL: ${ADMIN_USER_EMAIL}
    volumes:
      - /volume1/docker/bebe-moment/data:/data
    ports:
      - "3000:3000"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  worker:
    image: ghcr.io/svrforum/bebe-moment/worker:latest
    environment:
      DATABASE_URL: postgres://bebe:${POSTGRES_PASSWORD}@postgres:5432/bebe
      REDIS_URL: redis://redis:6379
      SECRET_KEY: ${SECRET_KEY}
      STORAGE_MODE: local
      STORAGE_PATH: /data
      PUID: "1026"
      PGID: "100"
    volumes:
      - /volume1/docker/bebe-moment/data:/data
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bebe
      POSTGRES_USER: bebe
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - /volume1/docker/bebe-moment/pg:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bebe"]

  redis:
    image: redis:7-alpine
    volumes:
      - /volume1/docker/bebe-moment/redis:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
```

6. **.env 편집** (하단 env 파일 탭):
```
SECRET_KEY=<openssl rand -hex 32 결과>
POSTGRES_PASSWORD=<복잡한 문자열>
PUBLIC_URL=https://bebe.mydomain.synology.me
ADMIN_USER_EMAIL=<관리자 이메일>
```

7. **시작**.

## TLS (DSM 리버스 프록시)

- DSM → 제어판 → 로그인 포털 → 고급 → 리버스 프록시
- Source: `bebe.mydomain.synology.me`, 443, HTTPS
- Destination: `localhost`, 3000, HTTP

## PUID/PGID

- DSM 기본 admin 사용자 uid = 1026, gid = users(100). 위 예시는 그 값을 사용.
- 다른 사용자로 돌리려면 SSH 접속 후 `id <username>` 으로 확인.

## 백업 — Hyper Backup

Hyper Backup 에서 다음 3개 공유 폴더 또는 하위를 백업 대상으로 지정:
- `/volume1/docker/bebe-moment/data` — 사진 원본 + 파생물
- `/volume1/docker/bebe-moment/pg` — 메타데이터 DB

redis 데이터는 큐 임시 상태라 백업 불필요.

## 업데이트

Container Manager → 프로젝트 → `bebe-moment` → "내려받기" → "다시 빌드" 로 최신 이미지 적용.
