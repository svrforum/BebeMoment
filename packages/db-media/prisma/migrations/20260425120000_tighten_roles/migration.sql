-- Phase B M3: 현재 광범위하게 부여된 권한을 원래 설계대로 조임.
-- bebe_web: public 전권 + media.assets_v_public 뷰 SELECT 만
-- bebe_media: media 전권 (public 접근 없음)

-- 1. 기존 광범위 GRANT 의 효과를 REVOKE 로 되돌리고, 필요한 것만 다시 GRANT.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM bebe_media;
REVOKE ALL ON ALL TABLES    IN SCHEMA media  FROM bebe_web;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bebe_media;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA media  FROM bebe_web;
REVOKE USAGE ON SCHEMA media FROM bebe_web;
REVOKE USAGE ON SCHEMA public FROM bebe_media;

-- 2. ALTER DEFAULT PRIVILEGES 되돌리기 — 새 테이블은 자동 GRANT 안 함
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  REVOKE ALL ON TABLES    FROM bebe_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media  REVOKE ALL ON SEQUENCES FROM bebe_web;

-- 3. 재부여 — 조여진 권한
-- bebe_web: public 전권 + media schema USAGE + view SELECT
GRANT USAGE ON SCHEMA public TO bebe_web;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO bebe_web;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO bebe_web;
GRANT USAGE ON SCHEMA media TO bebe_web;
GRANT SELECT ON media.assets_v_public TO bebe_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO bebe_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bebe_web;

-- bebe_media: media 전권
GRANT USAGE ON SCHEMA media TO bebe_media;
GRANT ALL ON ALL TABLES    IN SCHEMA media TO bebe_media;
GRANT ALL ON ALL SEQUENCES IN SCHEMA media TO bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media GRANT ALL ON TABLES    TO bebe_media;
ALTER DEFAULT PRIVILEGES IN SCHEMA media GRANT ALL ON SEQUENCES TO bebe_media;
