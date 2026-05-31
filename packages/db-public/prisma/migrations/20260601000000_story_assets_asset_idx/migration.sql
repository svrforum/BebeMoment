-- assetId-leading 역조회(타임라인 모델 B·캘린더의 story_assets WHERE asset_id IN (...))가
-- 복합 PK (entry_id, asset_id) 로 인덱스를 못 타 풀스캔이던 것을 단독 인덱스로 해결.
CREATE INDEX IF NOT EXISTS "story_assets_asset_id_idx" ON "public"."story_assets"("asset_id");
