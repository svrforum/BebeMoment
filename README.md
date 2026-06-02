# bebe-moment

셀프호스팅 **가족용 아기 포토 저널** (한 인스턴스 = 한 가족, 초대제). 타임라인·캘린더, 사진·영상 상세 뷰어 + 좋아요·댓글·북마크, 중첩/비밀 앨범, 일기(스토리), 성장기록·마일스톤, "오늘의 추억", 얼굴 인식(옵트인), 백업/복구, 설치형 PWA + 웹푸시, 안드로이드 앱(FCM·홈위젯), 멤버 관리, OIDC SSO 를 갖춘다.

## 배포

- **일반 Linux Docker**: [docs/deployment-linux.md](./docs/deployment-linux.md)
- **Synology DSM**: [docs/deployment-synology.md](./docs/deployment-synology.md)

태그를 푸시하면 GitHub Actions 가 단일 앱 이미지 `ghcr.io/<org>/bebe-moment/app:vX.Y.Z` (web·media·알림 워커를 한 컨테이너에서 실행) 를 빌드·푸시합니다. 현재는 **`linux/amd64` 전용** — `linux/arm64`(ARM 시놀로지 등) 빌드는 추후 추가 예정입니다.

## 개발

### 요구사항
- Node.js 22+, pnpm 11+
- Docker

### 시작
```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
# 마이그레이션 적용 — cross-schema FK 때문에 `migrate dev` 가 아니라 deploy 를 쓴다.
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-public exec prisma migrate deploy
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-media  exec prisma migrate deploy
# Prisma 클라이언트 생성(생성물은 gitignore — typecheck 전 필수)
pnpm --filter @bebe/db-public exec prisma generate && pnpm --filter @bebe/db-media exec prisma generate
pnpm dev
```

브라우저: http://localhost:3000 → 가입 → 온보딩 → 홈.

### dev 전체 실행 (web + media)

터미널 1 (web + infra):
```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @bebe/web dev
```

터미널 2 (media — tus + BullMQ 워커 + SSE):
```bash
pnpm --filter @bebe/media dev
```

업로드 파이프라인을 검증하려면 두 터미널이 모두 실행 중이어야 합니다.

### `.env` (dev)
```
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe
REDIS_URL=redis://localhost:6379
SECRET_KEY=dev_secret_key_32bytes_minimum_______________
PUBLIC_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=debug
# media 서비스(업로드/조회)에 필수 — 없으면 web 의 getMediaClient 가 throw
MEDIA_INTERNAL_URL=http://localhost:3001
MEDIA_SERVICE_TOKEN=dev_media_service_token_32bytes_minimum_______
MEDIA_JWT_SECRET=dev_media_jwt_secret_32bytes_minimum__________
```

> ⚠️ 루트 `.env` 는 gitignore **이자 dockerignore** 대상이라 도커 이미지에 들어가지 않는다. 프로덕션(compose/Synology)에서는 `MEDIA_SERVICE_TOKEN`·`MEDIA_JWT_SECRET`·`SECRET_KEY` 등 시크릿을 **런타임 env 로 주입**해야 한다(`compose/.env.example` 참조). `MEDIA_PUBLIC_BASE_URL`/`NEXT_PUBLIC_MEDIA_BASE_URL` 은 보통 미설정으로 두면 `PUBLIC_URL` 로 폴백된다.

## 테스트

```bash
pnpm test
pnpm typecheck
pnpm lint
```

## 구조

```
apps/
  web/            # Next.js 16 앱 (UI + API + PWA + 알림 워커)
  media/          # Fastify + BullMQ — tus 업로드 / signed URL / SSE / EXIF·파생물
packages/
  db-public/      # public 스키마 Prisma (user/family/baby/settings/push…) + tenant 미들웨어
  db-media/       # media 스키마 Prisma (asset…) + 크로스스키마 뷰 + DB 롤 마이그레이션
  core/           # 도메인 유틸 (나이 버킷, 권한 매트릭스, 큐 상수, 기능 플래그)
  config/         # zod env 스키마
  media-client/   # web → media HTTP 클라이언트 + 공유 스키마
  queue/          # 공유 Redis/BullMQ
  storage/        # 스토리지 어댑터 (local / S3)
android-app/      # Capacitor 안드로이드 앱 (pnpm 워크스페이스 밖)
```

> 배포는 단일 이미지 / 단일 포트(3000)에서 web·media·알림워커 3 프로세스로 실행된다.

## 페이즈

전체 페이즈 현황(P1~P6, Phase A~D, PWA+Push, 단일가족, username 인증, 멤버 관리 등 ~18개). 핵심 마일스톤만:

- [x] P1~P4 — Foundation / Upload / UX·PWA / Admin·Deploy
- [x] P5~P6 — 성장·마일스톤·일기 / 상세·소셜(좋아요·댓글·북마크)
- [x] Phase A~D — DB 경계 분리 / media 서비스 추출 / 조회 경로·파생물 / 태그·앨범·메타데이터
- [x] 단일 가족 초대제 · username 인증 · 가족 권한 구성 · 설정/관리자 개편 · PWA 푸시(+안드로이드 FCM) · 멤버 관리 Phase 1
- [x] 추억(Memories) · 안드로이드 홈위젯 · 얼굴 인식 P1(옵트인) · 백업/복구(전체·증분, 원격 S3 미러)
- [x] 유지보수 · 보안 강화 · 의존성 현대화 (Node 22 / Next 16 / React 19.2 / TS 6 / Prisma 7 / Fastify 5 / pnpm 11 / Postgres 17 / Valkey 9 / Better Auth)
