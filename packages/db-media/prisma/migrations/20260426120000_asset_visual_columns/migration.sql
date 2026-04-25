-- Phase C-2: 시각적 메타데이터 컬럼 추가
-- blurhash: 이미지 즉시 placeholder (렌더 전 background)
-- dominant_color: blurhash fallback / 빈 배경
-- aspect_ratio_cached: width/height 정규화 (0이거나 null 인 경우 대비)

ALTER TABLE media.assets
  ADD COLUMN IF NOT EXISTS blurhash             TEXT,
  ADD COLUMN IF NOT EXISTS dominant_color       TEXT,
  ADD COLUMN IF NOT EXISTS aspect_ratio_cached  NUMERIC(6, 4);

-- assets_v_public 뷰 재생성: 새 컬럼 노출
-- DROP+CREATE 로 컬럼 순서 재배치 허용 (CREATE OR REPLACE 는 컬럼 중간 삽입 불가)
DROP VIEW IF EXISTS media.assets_v_public;
CREATE VIEW media.assets_v_public AS
SELECT
  a.id,
  a.family_id,
  a.uploaded_by_user_id,
  a.kind,
  a.mime_type,
  a.width,
  a.height,
  a.duration_ms,
  a.taken_at,
  a.uploaded_at,
  a.status,
  a.visibility,
  a.tags,
  a.caption,
  a.blurhash,
  a.dominant_color,
  a.aspect_ratio_cached,
  a.created_at,
  a.updated_at,
  a.deleted_at,
  COALESCE(
    (SELECT array_agg(ab.baby_id ORDER BY ab.tagged_at)
       FROM media.asset_babies ab WHERE ab.asset_id = a.id),
    ARRAY[]::uuid[]
  ) AS baby_ids
FROM media.assets a;

-- 뷰는 재생성될 때 grant 가 사라지므로 재부여
GRANT SELECT ON media.assets_v_public TO bebe_web;
