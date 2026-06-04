-- 위젯 사진 소스 설정(per-user, widget_tokens 가 이미 1:1 user). 기본은 기존 동작과 동일한
-- 'recent'(전체 최신). 'bookmark_random'=북마크 랜덤, 'bookmark_pinned'=북마크 중 고정 1장
-- (widget_pinned_asset_id). 같은 스키마 변경이라 cross-schema FK 없음(§17#22).
ALTER TABLE "public"."widget_tokens"
  ADD COLUMN IF NOT EXISTS "widget_source" TEXT NOT NULL DEFAULT 'recent',
  ADD COLUMN IF NOT EXISTS "widget_pinned_asset_id" UUID;
