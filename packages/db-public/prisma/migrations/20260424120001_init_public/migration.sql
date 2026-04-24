-- Baseline for @bebe/db-public package. Creates the full `public` schema
-- (enums, tables, indexes, within-schema FKs). Cross-schema FKs that
-- reference `media.*` live in @bebe/db-media's init migration, applied
-- after this one.
--
-- Fresh databases: `prisma migrate deploy` from @bebe/db-public first,
-- then from @bebe/db-media.
-- Existing databases (upgraded from @bebe/db): use
-- `prisma migrate resolve --applied 20260424120001_init_public`.

--
-- Enums
--

CREATE TYPE public.gender AS ENUM (
    'male',
    'female',
    'other',
    'unspecified'
);

CREATE TYPE public.invite_role AS ENUM (
    'guardian',
    'family'
);

CREATE TYPE public.role AS ENUM (
    'owner',
    'guardian',
    'family'
);

--
-- Tables
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_by_id uuid,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.asset_bookmarks (
    asset_id uuid NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.asset_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    family_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    body text NOT NULL,
    mentioned_user_ids uuid[],
    edited_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.asset_likes (
    asset_id uuid NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.babies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    name text NOT NULL,
    birth_date date NOT NULL,
    birth_time text,
    gender public.gender,
    profile_asset_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.growth_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    baby_id uuid NOT NULL,
    measured_at date NOT NULL,
    height_cm numeric(5,2),
    weight_kg numeric(5,3),
    head_cm numeric(5,2),
    note text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    invited_by_id uuid NOT NULL,
    email text NOT NULL,
    role public.invite_role NOT NULL,
    token text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    accepted_at timestamp(3) without time zone,
    accepted_by_id uuid,
    revoked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    baby_id uuid,
    entry_date date NOT NULL,
    title text,
    body text NOT NULL,
    mood text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.journal_entry_assets (
    entry_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    "order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.role NOT NULL,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.milestone_assets (
    milestone_id uuid NOT NULL,
    asset_id uuid NOT NULL
);

CREATE TABLE public.milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    baby_id uuid NOT NULL,
    preset_key text,
    custom_label text,
    achieved_at date NOT NULL,
    note text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.oidc_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    subject text NOT NULL,
    email text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.oidc_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    issuer text NOT NULL,
    client_id text NOT NULL,
    client_secret_enc text NOT NULL,
    authorization_endpoint text,
    token_endpoint text,
    userinfo_endpoint text,
    jwks_uri text,
    scopes text[] DEFAULT ARRAY['openid'::text, 'email'::text, 'profile'::text],
    enabled boolean DEFAULT true NOT NULL,
    locked_by_env boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    current_family_id uuid,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.setting_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    changed_by uuid,
    changed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    email_verified boolean DEFAULT false NOT NULL,
    password_hash text,
    display_name text NOT NULL,
    avatar_path text,
    locale text DEFAULT 'ko'::text NOT NULL,
    timezone text DEFAULT 'Asia/Seoul'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

--
-- Primary / unique keys
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.asset_bookmarks
    ADD CONSTRAINT asset_bookmarks_pkey PRIMARY KEY (asset_id, user_id);

ALTER TABLE ONLY public.asset_comments
    ADD CONSTRAINT asset_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.asset_likes
    ADD CONSTRAINT asset_likes_pkey PRIMARY KEY (asset_id, user_id);

ALTER TABLE ONLY public.babies
    ADD CONSTRAINT babies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.growth_records
    ADD CONSTRAINT growth_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.journal_entry_assets
    ADD CONSTRAINT journal_entry_assets_pkey PRIMARY KEY (entry_id, asset_id);

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.milestone_assets
    ADD CONSTRAINT milestone_assets_pkey PRIMARY KEY (milestone_id, asset_id);

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oidc_providers
    ADD CONSTRAINT oidc_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.setting_history
    ADD CONSTRAINT setting_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Indexes
--

CREATE INDEX asset_bookmarks_family_id_user_id_created_at_idx ON public.asset_bookmarks USING btree (family_id, user_id, created_at);

CREATE INDEX asset_comments_author_user_id_idx ON public.asset_comments USING btree (author_user_id);

CREATE INDEX asset_comments_family_id_asset_id_created_at_idx ON public.asset_comments USING btree (family_id, asset_id, created_at);

CREATE INDEX asset_likes_family_id_user_id_idx ON public.asset_likes USING btree (family_id, user_id);

CREATE INDEX babies_family_id_idx ON public.babies USING btree (family_id);

CREATE UNIQUE INDEX families_slug_key ON public.families USING btree (slug);

CREATE INDEX growth_records_family_id_baby_id_measured_at_idx ON public.growth_records USING btree (family_id, baby_id, measured_at);

CREATE INDEX invites_family_id_idx ON public.invites USING btree (family_id);

CREATE UNIQUE INDEX invites_pending_unique ON public.invites USING btree (family_id, lower(email)) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));

CREATE UNIQUE INDEX invites_token_key ON public.invites USING btree (token);

CREATE INDEX journal_entries_family_id_baby_id_entry_date_idx ON public.journal_entries USING btree (family_id, baby_id, entry_date);

CREATE INDEX journal_entries_family_id_entry_date_idx ON public.journal_entries USING btree (family_id, entry_date);

CREATE UNIQUE INDEX memberships_family_id_user_id_key ON public.memberships USING btree (family_id, user_id);

CREATE INDEX memberships_user_id_idx ON public.memberships USING btree (user_id);

CREATE INDEX milestones_family_id_baby_id_achieved_at_idx ON public.milestones USING btree (family_id, baby_id, achieved_at);

CREATE UNIQUE INDEX milestones_family_id_baby_id_preset_key_key ON public.milestones USING btree (family_id, baby_id, preset_key);

CREATE UNIQUE INDEX oidc_identities_provider_id_subject_key ON public.oidc_identities USING btree (provider_id, subject);

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

CREATE INDEX setting_history_key_idx ON public.setting_history USING btree (key);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

--
-- Foreign keys (within public schema only; cross-schema FKs live in @bebe/db-media init)
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_bookmarks
    ADD CONSTRAINT asset_bookmarks_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_bookmarks
    ADD CONSTRAINT asset_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_comments
    ADD CONSTRAINT asset_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_comments
    ADD CONSTRAINT asset_comments_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_likes
    ADD CONSTRAINT asset_likes_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_likes
    ADD CONSTRAINT asset_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.babies
    ADD CONSTRAINT babies_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.growth_records
    ADD CONSTRAINT growth_records_baby_id_fkey FOREIGN KEY (baby_id) REFERENCES public.babies(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.growth_records
    ADD CONSTRAINT growth_records_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.growth_records
    ADD CONSTRAINT growth_records_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_accepted_by_id_fkey FOREIGN KEY (accepted_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_baby_id_fkey FOREIGN KEY (baby_id) REFERENCES public.babies(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.journal_entry_assets
    ADD CONSTRAINT journal_entry_assets_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.milestone_assets
    ADD CONSTRAINT milestone_assets_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_baby_id_fkey FOREIGN KEY (baby_id) REFERENCES public.babies(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.oidc_providers(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oidc_identities
    ADD CONSTRAINT oidc_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_current_family_id_fkey FOREIGN KEY (current_family_id) REFERENCES public.families(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.setting_history
    ADD CONSTRAINT setting_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
