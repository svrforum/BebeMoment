# bebe-moment

셀프호스팅 아기 포토 저널. **Plan 1 (Foundation)** — 인증·가족·초대·아기 등록.

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
- [ ] Plan 2 — Upload Pipeline
- [ ] Plan 3 — UX & PWA
- [ ] Plan 4 — Admin & Deploy
