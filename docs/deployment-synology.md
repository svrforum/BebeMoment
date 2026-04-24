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
      DATABASE_URL_WEB: postgres://bebe_web:${BEBE_WEB_DB_PASSWORD}@postgres:5432/bebe
      REDIS_URL: redis://redis:6379
      SECRET_KEY: ${SECRET_KEY}
      PUBLIC_URL: ${PUBLIC_URL}
      STORAGE_MODE: local
      STORAGE_PATH: /data
      PUID: "1026"
      PGID: "100"
      ADMIN_USER_EMAIL: ${ADMIN_USER_EMAIL}
      MEDIA_INTERNAL_URL: http://media:3001
      MEDIA_SERVICE_TOKEN: ${MEDIA_SERVICE_TOKEN}
      MEDIA_JWT_SECRET: ${MEDIA_JWT_SECRET}
      NEXT_PUBLIC_MEDIA_BASE_URL: ${NEXT_PUBLIC_MEDIA_BASE_URL}
      BEBE_WEB_DB_PASSWORD: ${BEBE_WEB_DB_PASSWORD}
      BEBE_MEDIA_DB_PASSWORD: ${BEBE_MEDIA_DB_PASSWORD}
    volumes:
      - /volume1/docker/bebe-moment/data:/data
    ports:
      - "3000:3000"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      media: { condition: service_healthy }
    restart: unless-stopped

  media:
    image: ghcr.io/svrforum/bebe-moment/media:latest
    environment:
      DATABASE_URL: postgres://bebe:${POSTGRES_PASSWORD}@postgres:5432/bebe
      DATABASE_URL_MEDIA: postgres://bebe_media:${BEBE_MEDIA_DB_PASSWORD}@postgres:5432/bebe
      REDIS_URL: redis://redis:6379
      SECRET_KEY: ${SECRET_KEY}
      PUBLIC_URL: ${PUBLIC_URL}
      STORAGE_MODE: local
      STORAGE_PATH: /data
      MEDIA_ROLE: both
      MEDIA_PORT: "3001"
      MEDIA_SERVICE_TOKEN: ${MEDIA_SERVICE_TOKEN}
      MEDIA_JWT_SECRET: ${MEDIA_JWT_SECRET}
      MEDIA_PUBLIC_BASE_URL: ${MEDIA_PUBLIC_BASE_URL}
      BEBE_WEB_DB_PASSWORD: ${BEBE_WEB_DB_PASSWORD}
      BEBE_MEDIA_DB_PASSWORD: ${BEBE_MEDIA_DB_PASSWORD}
      PUID: "1026"
      PGID: "100"
    volumes:
      - /volume1/docker/bebe-moment/data:/data
    ports:
      - "3001:3001"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/media/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
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

# Phase B — media 서비스 분리
# web ↔ media 서비스 간 내부 인증 (JWT signing 키와 관리용 공유 시크릿)
MEDIA_SERVICE_TOKEN=<openssl rand -hex 32>
MEDIA_JWT_SECRET=<openssl rand -hex 32>
# 브라우저가 media 서비스로 직접 업로드/SSE 할 때 쓰는 공개 베이스 URL.
# 리버스 프록시에서 /media → media:3001 매핑했다면 ${PUBLIC_URL} 그대로.
# 별도 서브도메인이면 https://media.mydomain.synology.me.
MEDIA_PUBLIC_BASE_URL=${PUBLIC_URL}
NEXT_PUBLIC_MEDIA_BASE_URL=${PUBLIC_URL}

# Phase B — DB role 분리 (web 은 public 스키마만, media 는 media 스키마만)
# postgres entrypoint 가 bebe_web / bebe_media 역할을 이 비밀번호로 생성한다.
BEBE_WEB_DB_PASSWORD=<복잡한 문자열>
BEBE_MEDIA_DB_PASSWORD=<복잡한 문자열>
```

7. **시작**.

## TLS (DSM 리버스 프록시)

- DSM → 제어판 → 로그인 포털 → 고급 → 리버스 프록시
- Source: `bebe.mydomain.synology.me`, 443, HTTPS
- Destination: `localhost`, 3000, HTTP

**media 서비스 노출 옵션** (Phase B): 브라우저가 업로드·SSE 를 위해 media
에 직접 붙어야 한다. 두 가지 방법 중 하나 선택:

1. **같은 호스트 + 경로 라우팅**: `bebe.mydomain.synology.me/media/*` 만
   `localhost:3001` 로 보내는 추가 규칙. `NEXT_PUBLIC_MEDIA_BASE_URL` 은
   `${PUBLIC_URL}` 그대로.
2. **별도 서브도메인**: `media.mydomain.synology.me` 를 `localhost:3001`
   로. `NEXT_PUBLIC_MEDIA_BASE_URL=https://media.mydomain.synology.me`.

어느 쪽이든 리버스 프록시에서 **타임아웃 충분히 (≥ 10 분)**, **WebSocket /
SSE 업그레이드 허용** 옵션 켜야 한다. tus 큰 파일 업로드와 진행률 SSE 가
끊기면 업로드가 실패한다.

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
