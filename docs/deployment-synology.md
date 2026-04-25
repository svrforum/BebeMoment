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
6. **`Caddyfile` 도 같은 경로에 업로드**: File Station 으로
   `/volume1/docker/bebe-moment/Caddyfile` 위치에 `compose/Caddyfile` 내용을
   복사. Caddy 컨테이너가 이 파일을 read-only 로 마운트한다.

### `docker-compose.yml` (Synology)

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "3000:80"
    volumes:
      - /volume1/docker/bebe-moment/Caddyfile:/etc/caddy/Caddyfile:ro
      - /volume1/docker/bebe-moment/caddy/data:/data
      - /volume1/docker/bebe-moment/caddy/config:/config
    depends_on:
      web: { condition: service_healthy }
      media: { condition: service_healthy }
    restart: unless-stopped

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
    expose:
      - "3000"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      media: { condition: service_healthy }
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

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
    expose:
      - "3001"
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

> **포트 라우팅**: 외부에 노출되는 컨테이너는 **Caddy 하나뿐** (호스트
> `3000` → Caddy `:80`). Caddy 가 `/media/*` 는 `media:3001` 로, 그 외는
> `web:3000` 으로 내부 도커 네트워크에서 reverse proxy 한다. 따라서 web /
> media 는 `ports:` 가 아니라 `expose:` 만 사용 — Synology 호스트 포트
> 충돌이 줄어든다.

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

## TLS

내부 Caddy 가 이미 `/media/*` 와 그 외 트래픽을 분리해 web/media 컨테이너로
나눠 보내므로, **외부에서는 단일 호스트·단일 포트 (3000) 만 신경쓰면 된다.**
TLS 종단은 두 가지 방법 중 하나:

### 방법 1 — DSM 리버스 프록시로 TLS 종단 (가장 간단)

- DSM → 제어판 → 로그인 포털 → 고급 → 리버스 프록시
- Source: `bebe.mydomain.synology.me`, 443, HTTPS
- Destination: `localhost`, 3000, HTTP  *(내부 Caddy)*
- 사용자 정의 헤더에서 **WebSocket** 켜기, **타임아웃 ≥ 600 초** (큰 tus
  업로드·SSE 가 끊기지 않도록).
- `NEXT_PUBLIC_MEDIA_BASE_URL=${PUBLIC_URL}` 그대로. 별도 서브도메인 불필요
  — 내부 Caddy 가 `/media/*` 경로 라우팅을 처리한다.

### 방법 2 — Caddy 자체에서 TLS 종단

`Caddyfile` 의 `:80 { … }` 블록을 도메인 블록으로 교체:

```caddyfile
bebe.mydomain.synology.me {
  handle /media/* {
    reverse_proxy media:3001 {
      flush_interval -1
      transport http {
        response_header_timeout 0s
        read_timeout 600s
      }
    }
  }
  handle {
    reverse_proxy web:3000
  }
  encode gzip zstd
}
```

이 경우 compose 의 caddy `ports:` 를 `"443:443"` + `"80:80"` 으로 바꾸고
DSM 80/443 포트가 비어 있어야 한다 (DSM 기본은 5000/5001 이라 보통 OK,
다른 패키지가 점유 중이면 충돌). Caddy 가 자동으로 Let's Encrypt 인증서를
발급·갱신한다 — 도메인이 NAS 의 공인 IP 로 정상 해석되는지 먼저 확인.

## PUID/PGID

- DSM 기본 admin 사용자 uid = 1026, gid = users(100). 위 예시는 그 값을 사용.
- 다른 사용자로 돌리려면 SSH 접속 후 `id <username>` 으로 확인.

## 백업 — Hyper Backup

Hyper Backup 에서 다음 공유 폴더 또는 하위를 백업 대상으로 지정:
- `/volume1/docker/bebe-moment/data` — 사진 원본 + 파생물
- `/volume1/docker/bebe-moment/pg` — 메타데이터 DB

redis 데이터는 큐 임시 상태라 백업 불필요. `caddy/data` 는 Let's Encrypt
인증서·키 캐시 — 사라져도 자동 재발급되지만 같이 백업하면 재시작 시
rate-limit 위험을 줄일 수 있다.

## 업데이트

Container Manager → 프로젝트 → `bebe-moment` → "내려받기" → "다시 빌드" 로 최신 이미지 적용.
