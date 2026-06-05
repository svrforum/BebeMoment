# Deployment — Synology DSM

> 배포 토폴로지는 **단일 앱 컨테이너 + postgres + redis** 3개뿐입니다. web·media·알림 워커는
> 한 이미지(`app`)의 세 프로세스로 돌고 **포트 3000 하나만** 노출합니다. 브라우저는
> `PUBLIC_URL/media/*` 로 미디어에 접근하고, 컨테이너 내부에서 Next 가 `localhost:3001` 로
> 프록시합니다. **별도 Caddy·리버스 프록시 컨테이너가 필요 없습니다.**

## 요구 사항
- DSM 7.2+
- Container Manager 패키지
- 공유 폴더 `docker` (또는 원하는 이름)
- amd64 시놀로지 (현재 이미지는 `linux/amd64` 전용 — ARM 모델은 `arm64` 이미지 추가 전까지 미지원)

## 1. 폴더 준비

File Station 으로 `/volume1/docker/bebe-moment` 아래에 미리 만들어 두면 권한 꼬임이 적습니다:

```
/volume1/docker/bebe-moment/
  data/      # 사진 원본 + 파생물
  pg/        # Postgres 데이터
  redis/     # 큐(임시)
  backups/   # 백업 번들
```

## 2. 프로젝트 만들기

1. **Container Manager → 프로젝트 → 만들기**
2. **이름**: `bebe-moment`, **경로**: `/volume1/docker/bebe-moment`
3. **소스**: `docker-compose.yml 만들기` → 아래 내용 붙여넣기

```yaml
services:
  app:
    image: ghcr.io/svrforum/bebe-moment/app:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://bebe:${POSTGRES_PASSWORD}@postgres:5432/bebe
      DATABASE_URL_WEB: postgres://bebe_web:${BEBE_WEB_DB_PASSWORD}@postgres:5432/bebe
      DATABASE_URL_MEDIA: postgres://bebe_media:${BEBE_MEDIA_DB_PASSWORD}@postgres:5432/bebe
      REDIS_URL: redis://redis:6379
      SECRET_KEY: ${SECRET_KEY}
      PUBLIC_URL: ${PUBLIC_URL}
      # 알림 방해금지·다이제스트·추억 푸시는 컨테이너 로컬 시각으로 판단 → 가족 시간대로.
      TZ: ${TZ:-Asia/Seoul}
      # web → 같은 컨테이너의 media(런타임) + Next /media rewrite(빌드). 단일 컨테이너라 localhost.
      MEDIA_INTERNAL_URL: http://localhost:3001
      # 보통 미설정으로 두면 PUBLIC_URL 로 폴백된다(동일 오리진 /media/*). :3001 등을 넣지 말 것.
      NEXT_PUBLIC_MEDIA_BASE_URL: ${PUBLIC_URL}
      MEDIA_PUBLIC_BASE_URL: ${PUBLIC_URL}
      MEDIA_SERVICE_TOKEN: ${MEDIA_SERVICE_TOKEN}
      MEDIA_JWT_SECRET: ${MEDIA_JWT_SECRET}
      STORAGE_MODE: local
      STORAGE_PATH: /data
      BACKUP_DIR: /backups
      # DSM admin: uid 1026 / gid users(100). 다른 사용자면 SSH 후 `id <user>` 로 확인.
      PUID: ${PUID:-1026}
      PGID: ${PGID:-100}
      ADMIN_USER_EMAIL: ${ADMIN_USER_EMAIL:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      BEBE_WEB_DB_PASSWORD: ${BEBE_WEB_DB_PASSWORD}
      BEBE_MEDIA_DB_PASSWORD: ${BEBE_MEDIA_DB_PASSWORD}
      # 얼굴 인식(옵트인) ML 사이드카. ml 컨테이너를 안 띄우면 호출도 없다.
      FACE_ML_URL: ${FACE_ML_URL:-http://ml:8000}
    volumes:
      - /volume1/docker/bebe-moment/data:/data
      - /volume1/docker/bebe-moment/backups:/backups
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s

  postgres:
    # pgvector 포함(얼굴 임베딩 벡터검색). 기존 alpine 데이터에서 올리면 소유권을
    # 999(debian postgres)로 chown 후 사용.
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: bebe
      POSTGRES_USER: bebe
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - /volume1/docker/bebe-moment/pg:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bebe"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    # Valkey (Redis BSD 포크). 서비스명은 redis 유지.
    image: valkey/valkey:9-alpine
    volumes:
      - /volume1/docker/bebe-moment/redis:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

> 표준 [`compose/docker-compose.yml`](../compose/docker-compose.yml) 과 동일한 구조에 시놀로지
> 절대경로·PUID/PGID 만 맞춘 것입니다. 리소스 한도(`deploy.resources`)·얼굴인식 `ml` 서비스는
> 표준 compose 를 참고해 그대로 옮길 수 있습니다(아래 "얼굴 인식" 참고).

## 3. 환경변수 (env 탭)

프로젝트 생성 화면의 **환경 변수(.env)** 탭에 입력합니다. 시크릿은 반드시 여기(런타임 env)에
넣습니다 — 이미지에는 들어가지 않습니다.

```
SECRET_KEY=<openssl rand -hex 32>
POSTGRES_PASSWORD=<복잡한 문자열>
PUBLIC_URL=https://bebe.mydomain.synology.me
ADMIN_USER_EMAIL=<관리자 이메일(선택)>
TZ=Asia/Seoul

# 서비스 간 인증/서명 (각 32바이트+) — 생성: openssl rand -hex 32
MEDIA_SERVICE_TOKEN=<랜덤 hex>
MEDIA_JWT_SECRET=<랜덤 hex>

# DB role 분리 (web=public 스키마, media=media 스키마). entrypoint 가 이 비번으로 역할 생성.
BEBE_WEB_DB_PASSWORD=<복잡한 문자열>
BEBE_MEDIA_DB_PASSWORD=<복잡한 문자열>
```

> ⚠️ `MEDIA_PUBLIC_BASE_URL` / `NEXT_PUBLIC_MEDIA_BASE_URL` 에 `:3001` 같은 값을 **넣지 마세요.**
> 노출되지 않은 포트를 가리켜 사진이 안 뜹니다. 미설정(또는 `PUBLIC_URL` 과 동일)이 정답입니다.

## 4. 시작 & 첫 로그인

빌드/시작 후:
- `PUBLIC_URL`(또는 NAS `http://<NAS-IP>:3000`) 접속 → **첫 사용자 가입** → 온보딩(가족·아기 설정)
- 첫 가입자가 곧 **관리자(owner)** 입니다. 이후 구성원은 **초대 링크로만** 합류합니다.
- 관리 화면은 `/admin`, 또는 설정 → 관리자.

## 5. TLS / 외부 공개 — DSM 리버스 프록시

내부에 별도 프록시가 없으므로 **DSM 리버스 프록시로 TLS 종단**만 하면 됩니다.

- DSM → 제어판 → 로그인 포털 → 고급 → **리버스 프록시** → 만들기
  - **Source**: `bebe.mydomain.synology.me`, 443, HTTPS
  - **Destination**: `localhost`, 3000, HTTP
- **사용자 정의 헤더**에서 **WebSocket** 켜기(`Create > WebSocket`), **타임아웃 ≥ 600초**
  (큰 tus 업로드·SSE 가 끊기지 않도록).
- `PUBLIC_URL` 은 이 공개 도메인(`https://…`)으로 맞춥니다. https 로 바뀌면 세션 쿠키가
  `__Secure-` 접두사로 전환되어 한 번 재로그인이 필요할 수 있습니다.
- 인증서는 DSM → 보안 → 인증서에서 Let's Encrypt 로 발급해 이 리버스 프록시에 적용.

## 6. 얼굴 인식 (옵트인)

기본은 꺼져 있습니다. 켜려면 표준 [`compose/docker-compose.yml`](../compose/docker-compose.yml) 의
`ml` 서비스 블록(profile `faces`, 이미지 `ghcr.io/svrforum/bebe-moment/ml`)을 위 compose 에
추가하고, `FACE_ML_URL=http://ml:8000` 으로 둔 뒤 관리자 → 기능에서 얼굴 인식을 켜면 됩니다.
모델팩은 첫 기동 때 받아 볼륨에 캐시됩니다(amd64 CPU 추론, 메모리 ~3GB 권장).

## 7. 백업 — Hyper Backup

앱 자체 백업(설정 → 관리자 → 백업, 전체·증분·원격 S3)을 권장하되, NAS 레벨로도:
- `/volume1/docker/bebe-moment/data` — 사진 원본 + 파생물
- `/volume1/docker/bebe-moment/pg` — 메타데이터 DB
- `/volume1/docker/bebe-moment/backups` — 앱 백업 번들

`redis` 는 큐 임시 상태라 백업 불필요합니다.

## 8. 업데이트

Container Manager → 프로젝트 `bebe-moment` → **이미지 → 내려받기(pull)** → **다시 빌드**.
기동 시 `prisma migrate deploy` 가 자동 실행되어 스키마가 최신으로 맞춰집니다.

## 트러블슈팅

- **사진 페이지가 500 / 로그에 `MEDIA_SERVICE_TOKEN env required`** — env 탭에
  `MEDIA_SERVICE_TOKEN`·`MEDIA_JWT_SECRET` 가 빠졌습니다. `/api/health` 는 미디어를 안 거쳐
  200 으로 남으니 실제 사진 페이지로 확인하세요.
- **페이지는 뜨는데 썸네일이 깨짐** — `MEDIA_PUBLIC_BASE_URL`/`NEXT_PUBLIC_MEDIA_BASE_URL` 에
  `:3001` 등 노출 안 된 포트를 넣은 경우입니다. 미설정(PUBLIC_URL 폴백)으로 두세요.
- **pg16 → pg17 업그레이드** — 데이터 디렉터리 비호환. `pg_dump`(구버전)→restore(pg17) 후
  `pg/` 를 비우고 시작하거나, 앱 백업/복구를 사용하세요.
