-- 1. media schema 생성 (idempotent)
CREATE SCHEMA IF NOT EXISTS media;

-- 2. enum 타입 이동 (Postgres enum 은 schema-scoped)
ALTER TYPE "public"."asset_kind"       SET SCHEMA media;
ALTER TYPE "public"."asset_status"     SET SCHEMA media;
ALTER TYPE "public"."taken_at_source"  SET SCHEMA media;
ALTER TYPE "public"."visibility"       SET SCHEMA media;
ALTER TYPE "public"."detection_source" SET SCHEMA media;

-- 3. 테이블 이동 (메타데이터 변경만, 데이터 물리 이동 없음)
ALTER TABLE "public"."assets"       SET SCHEMA media;
ALTER TABLE "public"."asset_babies" SET SCHEMA media;

-- 4. assets_v_public 뷰 생성 — web 이 media 테이블에 접근하지 않고 자산 메타를 조회하는 유일한 지점
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
  a.created_at,
  a.updated_at,
  a.deleted_at,
  COALESCE(
    (SELECT array_agg(ab.baby_id ORDER BY ab.tagged_at)
     FROM media.asset_babies ab WHERE ab.asset_id = a.id),
    ARRAY[]::uuid[]
  ) AS baby_ids
FROM media.assets a;

-- 5. role 생성 (idempotent). Phase A 에서는 권한을 넓게 부여. Phase B 에서 조임.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bebe_web') THEN
    CREATE ROLE bebe_web LOGIN PASSWORD 'bebe_web_placeholder';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bebe_media') THEN
    CREATE ROLE bebe_media LOGIN PASSWORD 'bebe_media_placeholder';
  END IF;
END $$;

-- Phase A: 두 role 모두 두 스키마에 넓게 접근 가능 (기존 단일 role 과 동등)
GRANT USAGE ON SCHEMA public, media TO bebe_web, bebe_media;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO bebe_web, bebe_media;
GRANT ALL ON ALL TABLES    IN SCHEMA media  TO bebe_web, bebe_media;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO bebe_web, bebe_media;
GRANT ALL ON ALL SEQUENCES IN SCHEMA media  TO bebe_web, bebe_media;
GRANT USAGE ON SCHEMA media TO bebe_web;
GRANT SELECT ON media.assets_v_public TO bebe_web;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  GRANT ALL ON TABLES    TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  GRANT ALL ON SEQUENCES TO bebe_web, bebe_media;
