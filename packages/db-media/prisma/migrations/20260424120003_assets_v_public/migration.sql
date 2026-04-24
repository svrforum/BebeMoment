CREATE OR REPLACE VIEW media.assets_v_public AS
SELECT
  a.id, a.family_id, a.uploaded_by_user_id, a.kind, a.mime_type,
  a.width, a.height, a.duration_ms, a.taken_at, a.uploaded_at,
  a.status, a.visibility, a.tags, a.caption, a.created_at,
  a.updated_at, a.deleted_at,
  COALESCE(
    (SELECT array_agg(ab.baby_id ORDER BY ab.tagged_at)
       FROM media.asset_babies ab WHERE ab.asset_id = a.id),
    ARRAY[]::uuid[]
  ) AS baby_ids
FROM media.assets a;
