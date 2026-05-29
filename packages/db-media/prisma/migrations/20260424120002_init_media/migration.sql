-- Baseline for @bebe/db-media package. Creates the full `media` schema
-- (enums, tables, indexes, within-schema FKs) and then the cross-schema FKs
-- bridging public <-> media. Must run AFTER @bebe/db-public's init migration
-- (public.users / public.families / public.babies / etc. must already exist).
--
-- Fresh databases: run @bebe/db-public first, then this, then the
-- 20260424120003_assets_v_public view migration.
-- Existing databases (upgraded from @bebe/db): use
-- `prisma migrate resolve --applied 20260424120002_init_media`.

CREATE SCHEMA media;

--
-- Enums
--

CREATE TYPE media.asset_kind AS ENUM (
    'image',
    'video'
);

CREATE TYPE media.asset_status AS ENUM (
    'uploading',
    'processing',
    'ready',
    'failed'
);

CREATE TYPE media.detection_source AS ENUM (
    'manual',
    'ai'
);

CREATE TYPE media.taken_at_source AS ENUM (
    'exif',
    'filename',
    'filemtime',
    'manual',
    'uploaded'
);

CREATE TYPE media.visibility AS ENUM (
    'private',
    'family'
);

--
-- Tables
--

CREATE TABLE media.asset_babies (
    asset_id uuid NOT NULL,
    baby_id uuid NOT NULL,
    tagged_by_user_id uuid NOT NULL,
    tagged_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    detection_source media.detection_source DEFAULT 'manual'::media.detection_source NOT NULL
);

CREATE TABLE media.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    kind media.asset_kind NOT NULL,
    original_key text NOT NULL,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 character(64) NOT NULL,
    width integer,
    height integer,
    duration_ms integer,
    taken_at timestamp(3) without time zone NOT NULL,
    taken_at_source media.taken_at_source NOT NULL,
    uploaded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    gps_lat double precision,
    gps_lng double precision,
    camera_make text,
    camera_model text,
    exif_raw jsonb,
    original_converted_from text,
    status media.asset_status DEFAULT 'uploading'::media.asset_status NOT NULL,
    processing_error text,
    derivatives jsonb DEFAULT '{}'::jsonb NOT NULL,
    visibility media.visibility DEFAULT 'family'::media.visibility NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    caption text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

--
-- Primary / unique keys
--

ALTER TABLE ONLY media.asset_babies
    ADD CONSTRAINT asset_babies_pkey PRIMARY KEY (asset_id, baby_id);

ALTER TABLE ONLY media.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);

--
-- Indexes
--

CREATE UNIQUE INDEX assets_family_id_sha256_key ON media.assets USING btree (family_id, sha256);

CREATE INDEX assets_family_id_status_idx ON media.assets USING btree (family_id, status);

CREATE INDEX assets_family_id_taken_at_idx ON media.assets USING btree (family_id, taken_at);

CREATE INDEX assets_ready_timeline_idx ON media.assets USING btree (family_id, taken_at DESC, id DESC) WHERE ((deleted_at IS NULL) AND (status = 'ready'::media.asset_status));

CREATE INDEX assets_timeline_idx ON media.assets USING btree (family_id, status, taken_at, id);

--
-- Within-schema foreign keys
--

ALTER TABLE ONLY media.asset_babies
    ADD CONSTRAINT asset_babies_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Cross-schema foreign keys (media -> public)
--

ALTER TABLE ONLY media.asset_babies
    ADD CONSTRAINT asset_babies_baby_id_fkey FOREIGN KEY (baby_id) REFERENCES public.babies(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY media.asset_babies
    ADD CONSTRAINT asset_babies_tagged_by_user_id_fkey FOREIGN KEY (tagged_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY media.assets
    ADD CONSTRAINT assets_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY media.assets
    ADD CONSTRAINT assets_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Cross-schema foreign keys (public -> media)
-- These must live here because they reference media.assets, which didn't
-- exist when @bebe/db-public's init migration ran.
--

ALTER TABLE ONLY public.babies
    ADD CONSTRAINT babies_profile_asset_id_fkey FOREIGN KEY (profile_asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_bookmarks
    ADD CONSTRAINT asset_bookmarks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_comments
    ADD CONSTRAINT asset_comments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_likes
    ADD CONSTRAINT asset_likes_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_assets
    ADD CONSTRAINT story_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.milestone_assets
    ADD CONSTRAINT milestone_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES media.assets(id) ON UPDATE CASCADE ON DELETE CASCADE;
