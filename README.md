# bebe-moment

셀프호스팅 아기 포토 저널. **Plan 1 (Foundation)** — 인증·가족·초대·아기 등록.

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
```

## 테스트

```bash
pnpm test
pnpm typecheck
pnpm lint
```

## 구조

```
apps/
  web/          # Next.js 15 앱
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
