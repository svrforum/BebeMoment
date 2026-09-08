-- 타임라인 그리드(merged-list)가 실패한 자산도 싣게 되면서 status IN ('ready','failed') 로
-- 바뀌었는데, 두 부분 인덱스의 술어는 status = 'ready' 라 쿼리가 더는 그 술어를 함의하지
-- 않았다 — 플래너가 촬영순은 비부분 assets_family_id_taken_at_idx 로 폴백하고, 업로드순은
-- 정렬 인덱스 없이 돌았다. 그리드가 거는 조건(deleted_at·duplicate_of·status)을 그대로
-- 술어로 옮긴다. status = 'ready' 만 보는 쿼리(뷰어 prev/next·캘린더·추억)는 이 술어를
-- 함의하므로 같은 인덱스를 탄다. (부분 인덱스는 Prisma 스키마 밖 — SQL 로만 정의.)
DROP INDEX IF EXISTS media.assets_ready_timeline_idx;
DROP INDEX IF EXISTS media.assets_ready_uploaded_idx;

CREATE INDEX assets_grid_taken_idx
  ON media.assets USING btree (family_id, taken_at DESC, id DESC)
  WHERE deleted_at IS NULL AND duplicate_of IS NULL
    AND status IN ('ready'::media.asset_status, 'failed'::media.asset_status);

CREATE INDEX assets_grid_uploaded_idx
  ON media.assets USING btree (family_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND duplicate_of IS NULL
    AND status IN ('ready'::media.asset_status, 'failed'::media.asset_status);
