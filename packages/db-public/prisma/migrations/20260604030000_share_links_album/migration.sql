-- 공유 링크에 앨범 타깃 추가. album_id(public.albums 자산 — 같은 스키마지만 FK 없이 컬럼만:
-- secret/삭제 검증은 앱에서) 추가 + story/asset/album 중 정확히 하나만 채워지도록 CHECK 교체.
ALTER TABLE "public"."share_links" ADD COLUMN IF NOT EXISTS "album_id" UUID;
ALTER TABLE "public"."share_links" DROP CONSTRAINT IF EXISTS "share_links_target_chk";
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_target_chk"
  CHECK (
    (("story_id" IS NOT NULL)::int + ("asset_id" IS NOT NULL)::int + ("album_id" IS NOT NULL)::int) = 1
  );
CREATE INDEX IF NOT EXISTS "share_links_family_album_idx"
  ON "public"."share_links"("family_id", "album_id");
