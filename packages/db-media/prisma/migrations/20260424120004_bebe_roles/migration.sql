-- Create bebe_web / bebe_media roles for Phase B role tightening.
-- Phase A keeps permissions wide (matches existing single-role behavior).
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bebe_web') THEN
    CREATE ROLE bebe_web LOGIN PASSWORD 'bebe_web_placeholder';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bebe_media') THEN
    CREATE ROLE bebe_media LOGIN PASSWORD 'bebe_media_placeholder';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, media TO bebe_web, bebe_media;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO bebe_web, bebe_media;
GRANT ALL ON ALL TABLES    IN SCHEMA media  TO bebe_web, bebe_media;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO bebe_web, bebe_media;
GRANT ALL ON ALL SEQUENCES IN SCHEMA media  TO bebe_web, bebe_media;
GRANT SELECT ON media.assets_v_public TO bebe_web;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  GRANT ALL ON TABLES    TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bebe_web, bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  GRANT ALL ON SEQUENCES TO bebe_web, bebe_media;
