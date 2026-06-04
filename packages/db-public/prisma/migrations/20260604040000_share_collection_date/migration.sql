-- 공유 링크에 "여러 장 선택"(컬렉션)·"날짜" 타깃 추가.
--  · target_date: 그 날짜의 사진 모음 공유(동적 — 그 날 사진이 늘면 반영).
--  · share_link_assets: 사용자가 고른 사진 N장(컬렉션). 단일 id 가 없어 share_links 의 네
--    단일 컬럼은 모두 NULL 이고 자식 테이블 row 로 구성된다.
-- CHECK 완화: story/asset/album/target_date 중 "최대 하나"(0개면 컬렉션).
ALTER TABLE "public"."share_links" ADD COLUMN IF NOT EXISTS "target_date" DATE;
ALTER TABLE "public"."share_links" DROP CONSTRAINT IF EXISTS "share_links_target_chk";
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_target_chk" CHECK (
  (("story_id" IS NOT NULL)::int + ("asset_id" IS NOT NULL)::int
   + ("album_id" IS NOT NULL)::int + ("target_date" IS NOT NULL)::int) <= 1
);
CREATE INDEX IF NOT EXISTS "share_links_family_date_idx"
  ON "public"."share_links"("family_id", "target_date");

CREATE TABLE IF NOT EXISTS "public"."share_link_assets" (
  "token"      TEXT NOT NULL REFERENCES "public"."share_links"("token") ON DELETE CASCADE,
  "asset_id"   UUID NOT NULL,
  "sort_index" INT NOT NULL DEFAULT 0,
  PRIMARY KEY ("token", "asset_id")
);
