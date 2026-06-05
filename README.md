<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="Bebe Moment" width="520">
  </picture>
</p>

<p align="center">
  <b>우리 가족만을 위한, 셀프호스팅 아기 포토 저널</b><br>
  사진·영상·성장의 순간을 광고도, 추적도, 구독료도 없이 우리 서버에 담습니다.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-3b82f6"></a>
  <a href="https://github.com/svrforum/bebe-moment/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/svrforum/bebe-moment?color=3b82f6"></a>
  <img alt="Platform" src="https://img.shields.io/badge/deploy-Docker%20%C2%B7%20Synology-3b82f6">
  <img alt="Android" src="https://img.shields.io/badge/app-PWA%20%C2%B7%20Android-3b82f6">
</p>

<p align="center">
  <b>한국어</b> · <a href="README.en.md">English</a>
</p>

---

## 한 인스턴스 = 한 가족

**Bebe Moment** 는 베베메모(Bebememo)에서 영감을 받은 **셀프호스팅 가족용 아기 포토 저널**입니다. 클라우드에 아이의 사진을 맡기는 대신, **내 서버(시놀로지 NAS·홈 리눅스·VPS)** 에 직접 띄워 가족끼리만 보고 기록합니다.

- 🔒 **내 데이터는 내 서버에** — 외부 클라우드 업로드·광고·트래킹·구독료 없음
- 👨‍👩‍👧 **한 인스턴스 = 한 가족** — 첫 사용자(관리자)가 가족을 세팅하고, 이후 구성원은 **초대 링크로만** 합류
- 🖼️ **원본은 원본** — 올린 바이트 그대로 보존. 호환 변환은 선택
- 🏠 **셀프호스팅 퍼스트** — 특히 **Synology DSM** 에서 클릭 몇 번으로

> 가족 데이터 경계(`family_id`)는 코드 전반에서 강제됩니다. 멀티테넌시 격리는 안전망으로 유지하되, 인스턴스당 가족은 영구히 하나입니다.

## ✨ 주요 기능

| | |
|---|---|
| 🗓️ **타임라인 · 캘린더** | 촬영일 기준 자동 정렬, 월/일 단위 탐색 |
| 🖼️ **사진 · 영상 뷰어** | 풀스크린 뷰어, AVIF/WebP 포맷 협상, blurhash 즉시 표시, 부드러운 전환 |
| ❤️ **소셜** | 좋아요 · 댓글(멘션) · 북마크 — 기능별 on/off |
| 📔 **스토리(일기)** | 그날의 이야기를 사진과 함께 기록 |
| 📁 **앨범** | 중첩 앨범 · 비밀 앨범(역할별 가시성) |
| 📏 **성장 기록 · 마일스톤** | 키·몸무게 추이, 첫 걸음 같은 순간 |
| 💝 **오늘의 추억** | "작년 오늘", "몇 달 전 오늘"의 사진·스토리를 다시 |
| 👤 **얼굴 인식 (옵트인)** | 인물별 자동 묶음 — 끄고 켤 수 있음 |
| 🔗 **공유 링크** | 사진·앨범·스토리·날짜를 토큰 링크로(만료·해제 가능, 원본 저장은 가족만) |
| 🌐 **다국어** | 한국어 · English (설정에서 전환) |
| 🌙 **다크 모드 · PWA** | 설치형 홈화면 앱 + 웹푸시 알림 |
| 🔔 **알림** | 새 사진·댓글·추억 등 — 카테고리·기기별 설정 |
| 👥 **멤버 관리** | 역할(owner/guardian/family)별 권한, 가족 권한 구성, 정지·재설정 |
| 🔐 **인증** | 아이디(username) 기반 + OIDC SSO 연동 |
| 💾 **백업 · 복구** | 전체·증분 번들, 원격 S3 미러, 스케줄러, 인앱·CLI 복구 |

## 📱 어디서나

- **웹 / PWA** — 브라우저로 접속, "홈 화면에 추가"로 설치형 앱처럼. 웹푸시 알림 지원
- **안드로이드 앱** — Capacitor 기반, **FCM 푸시** + **홈 위젯**(가족 사진 슬라이드). [Releases](https://github.com/svrforum/bebe-moment/releases) 에서 APK 배포

## 🚀 시작하기 (셀프호스팅)

배포 토폴로지는 **app + postgres + redis** 컨테이너 3개. web·media·알림 워커는 **단일 이미지의 세 프로세스**로 포트 3000 하나만 노출합니다.

- 🐳 **일반 Linux Docker** → [docs/deployment-linux.md](docs/deployment-linux.md)
- 🟦 **Synology DSM (Container Manager)** → [docs/deployment-synology.md](docs/deployment-synology.md)

이미지는 태그 푸시 시 GitHub Actions 가 `ghcr.io/svrforum/bebe-moment/app:vX.Y.Z` 로 빌드·푸시합니다. 현재 **`linux/amd64` 전용**(ARM 시놀로지용 `arm64` 는 추후 추가 예정).

```yaml
# compose 발췌 — 자세한 건 위 배포 문서 참조
services:
  app:
    image: ghcr.io/svrforum/bebe-moment/app:latest
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://...
      SECRET_KEY: <32바이트 이상>
      PUBLIC_URL: https://bebe.example.com
    # PUID/PGID, 볼륨(./data:/data), media 시크릿 등은 배포 문서 참조
```

## 🛠️ 기술 스택

**TypeScript** 풀스택 모노레포(pnpm workspaces) · **Next.js 16**(App Router·Turbopack) · **Postgres + Prisma 7**(드라이버 어댑터·tenant 격리) · **Redis + BullMQ** · **Better Auth**(bcryptjs) · **Fastify**(media: tus 업로드·signed URL·SSE·sharp/ffmpeg) · **Tailwind + shadcn/ui + framer-motion** · **next-intl** · **Capacitor**(Android). 테스트는 **vitest + testcontainers**(실 Postgres).

## ❤️ 후원

Bebe Moment 는 **광고도 구독료도 없는** 개인 오픈소스 프로젝트입니다. 도움이 되었다면 응원해 주세요 — 커피 한 잔이 큰 힘이 됩니다 ☕

<p>
  <a href="https://buymeacoffee.com/svrforum"><img alt="Buy Me A Coffee" src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=svrforum&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff"></a>
</p>

- ⭐ **[저장소에 Star](https://github.com/svrforum/bebe-moment)** 를 눌러 주시면 더 많은 분께 닿습니다
- 🐛 버그 제보·기능 제안은 [Issues](https://github.com/svrforum/bebe-moment/issues) 로
- 앱 안에서도 **설정 → GitHub · 후원하기** 로 바로 연결됩니다

## 👩‍💻 개발

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis

# 마이그레이션 — cross-schema FK 때문에 migrate dev 가 아니라 deploy
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-public exec prisma migrate deploy
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-media  exec prisma migrate deploy
# Prisma 클라이언트 생성(생성물은 gitignore — typecheck 전 필수)
pnpm --filter @bebe/db-public exec prisma generate && pnpm --filter @bebe/db-media exec prisma generate

pnpm dev                                          # web + media 동시
```

브라우저 → http://localhost:3000 → 가입 → 온보딩 → 홈. 업로드 파이프라인 검증에는 web·media 둘 다 실행돼야 합니다.

```bash
pnpm test        # vitest (+ testcontainers 실 Postgres)
pnpm typecheck
pnpm lint
pnpm licenses:check   # 의존성 라이선스 AGPL 호환성 점검
```

<details>
<summary>모노레포 구조</summary>

```
apps/
  web/            # Next.js 16 — UI + API + PWA + 알림 워커
  media/          # Fastify + BullMQ — tus 업로드 / signed URL / SSE / EXIF·파생물
packages/
  db-public/      # public 스키마 Prisma + tenant 미들웨어
  db-media/       # media 스키마 Prisma + DB 롤 마이그레이션
  core/           # 도메인 유틸 (나이 버킷, 권한 매트릭스, 기능 플래그)
  config/         # zod env 스키마
  media-client/   # web → media HTTP 클라이언트
  queue/          # 공유 Redis/BullMQ
  storage/        # 스토리지 어댑터 (local / S3)
android-app/      # Capacitor 안드로이드 앱 (pnpm 워크스페이스 밖)
```
</details>

## 📄 라이선스

**[GNU AGPL-3.0-only](LICENSE)** — Copyright © 2026 svrforum.

자유롭게 사용·수정·셀프호스팅할 수 있는 오픈소스입니다. 단, 이 코드(또는 수정본)를 **네트워크 서비스로 제공**하면 그 변경 소스도 같은 라이선스로 공개해야 합니다(AGPL 네트워크 조항). 상용 폐쇄 포크·SaaS 를 막고 오픈소스로 유지하기 위한 선택입니다. 의존성은 각자의 라이선스를 따릅니다(대부분 MIT/Apache-2.0; `pnpm licenses:check` 로 호환성 점검).
