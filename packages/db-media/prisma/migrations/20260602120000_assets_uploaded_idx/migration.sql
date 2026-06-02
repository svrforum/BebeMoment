-- sort=uploaded 타임라인·뷰어 prev/next 가 (family_id, created_at DESC, id DESC) 로
-- 정렬·키셋한다. ready 자산만 보는 부분 인덱스 — taken_at 용 assets_ready_timeline_idx 와 대칭.
CREATE INDEX IF NOT EXISTS assets_ready_uploaded_idx
  ON media.assets USING btree (family_id, created_at DESC, id DESC)
  WHERE ((deleted_at IS NULL) AND (status = 'ready'::media.asset_status));
