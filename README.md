# bebe-moment

셀프호스팅 **가족용 아기 포토 저널** (한 인스턴스 = 한 가족, 초대제). 타임라인·캘린더, 사진·영상 상세 뷰어 + 좋아요·댓글·북마크, 중첩/비밀 앨범, 태그, 일기(스토리), 성장기록·마일스톤, 설치형 PWA + 웹푸시, 안드로이드 앱(FCM), 멤버 관리, OIDC SSO 를 갖춘다. 전체 페이즈 현황은 [CLAUDE.md §3](./CLAUDE.md) 참조.

## 배포

- **일반 Linux Docker**: [docs/deployment-linux.md](./docs/deployment-linux.md)
- **Synology DSM**: [docs/deployment-synology.md](./docs/deployment-synology.md)

태그를 푸시하면 GitHub Actions 가 `ghcr.io/<org>/bebe-moment-{web,media}:vX.Y.Z` 멀티 아키 이미지를 빌드·푸시합니다.

## 개발

### 요구사항
- Node.js 20+, pnpm 9+
- Docker

### 시작
```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
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
  web/          # Next.js 16 앱
packages/
  db/           # Prisma 스키마 + 클라이언트 + tenant 미들웨어
  core/         # 도메인 유틸 (나이 버킷, 권한)
  config/       # zod env 스키마
docs/
  superpowers/  # 스펙 / 계획
```

## 페이즈

- [x] Plan 1 — Foundation (인증·가족·초대)
- [x] Plan 2 — Upload Pipeline (업로드·썸네일·EXIF·영상 프리뷰)
- [x] Plan 3 — UX & PWA
- [x] Plan 4 — Admin & Deploy (관리자 설정·OIDC·Docker Compose·Synology·CI)
