-- 스토리 공유 링크(난수 토큰). 예측 가능한 /s/<순번> 대신 토큰으로 공유 — 영구 또는 기간제,
-- 해제(revoke) 가능. 공개 라우트는 token 으로 조회(tenant 우회 raw). 같은 스키마 FK(public)만.
CREATE TABLE IF NOT EXISTS "public"."share_links" (
  "token"               TEXT PRIMARY KEY,
  "family_id"           UUID NOT NULL,
  "story_id"            UUID NOT NULL,
  "created_by_user_id"  UUID NOT NULL,
  "expires_at"          TIMESTAMP(3),
  "revoked_at"          TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_accessed_at"    TIMESTAMP(3),
  CONSTRAINT "share_links_story_id_fkey"
    FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE,
  CONSTRAINT "share_links_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "share_links_family_story_idx"
  ON "public"."share_links"("family_id", "story_id");
