-- 공유 링크에 단일 사진(asset) 타깃 추가. story_id 를 nullable 로 풀고 asset_id(미디어 스키마
-- 자산 UUID — cross-schema 라 FK 없이 컬럼만) 추가. 정확히 하나만 채워지도록 CHECK.
ALTER TABLE "public"."share_links" ALTER COLUMN "story_id" DROP NOT NULL;
ALTER TABLE "public"."share_links" ADD COLUMN IF NOT EXISTS "asset_id" UUID;
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_target_chk"
  CHECK (("story_id" IS NOT NULL) <> ("asset_id" IS NOT NULL));
CREATE INDEX IF NOT EXISTS "share_links_family_asset_idx"
  ON "public"."share_links"("family_id", "asset_id");
