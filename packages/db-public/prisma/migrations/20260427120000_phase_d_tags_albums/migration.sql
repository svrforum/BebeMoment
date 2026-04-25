-- Phase D — Tags + Albums.
-- Lives in public schema next to likes / bookmarks / comments because the
-- existing pattern is "user-generated metadata that points at media.assets
-- by uuid (no enforced FK)" and web has full public-schema access.

-- ─────────────────────────────────────────────────────────────────────────
-- Tags

CREATE TABLE public.tags (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name                TEXT         NOT NULL,
  slug                TEXT         NOT NULL,
  color               TEXT,
  created_by_user_id  UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT tags_name_len CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT tags_slug_len CHECK (char_length(slug) BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX tags_family_slug_unique
  ON public.tags(family_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX tags_family_idx ON public.tags(family_id, deleted_at);

CREATE TABLE public.asset_tags (
  asset_id            UUID         NOT NULL,
  tag_id              UUID         NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  family_id           UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  added_by_user_id    UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  added_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX asset_tags_tag_idx    ON public.asset_tags(tag_id);
CREATE INDEX asset_tags_family_idx ON public.asset_tags(family_id, asset_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Albums (with optional nesting via parent_id + materialized path).

CREATE TABLE public.albums (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  parent_id           UUID         REFERENCES public.albums(id) ON DELETE CASCADE,
  name                TEXT         NOT NULL,
  description         TEXT,
  cover_asset_id      UUID,                                  -- soft ref to media.assets, app sets to NULL on cover delete
  sort_index          INTEGER      NOT NULL DEFAULT 0,
  -- Materialized path: "<rootId>" or "<a>/<b>/<c>" using slash-separated
  -- album uuids ending with this album's id. Maintained in app (transactional
  -- recompute on insert / move). Lets "all descendants" be one LIKE prefix scan.
  path                TEXT         NOT NULL,
  depth               INTEGER      NOT NULL DEFAULT 0,
  created_by_user_id  UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT albums_name_len   CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT albums_no_slash   CHECK (position('/' IN name) = 0),
  CONSTRAINT albums_depth_ceil CHECK (depth BETWEEN 0 AND 4)
);

-- Sibling-name uniqueness within the same parent (NULL parent for roots).
-- We need two partial indexes because PostgreSQL treats NULLs as distinct in
-- multi-column unique constraints, which would let two root albums share a name.
CREATE UNIQUE INDEX albums_sibling_unique_named_parent
  ON public.albums(family_id, parent_id, name)
  WHERE deleted_at IS NULL AND parent_id IS NOT NULL;

CREATE UNIQUE INDEX albums_sibling_unique_root
  ON public.albums(family_id, name)
  WHERE deleted_at IS NULL AND parent_id IS NULL;

CREATE INDEX albums_family_parent_idx ON public.albums(family_id, parent_id, deleted_at);
CREATE INDEX albums_path_prefix_idx   ON public.albums(family_id, path varchar_pattern_ops);
CREATE INDEX albums_cover_idx         ON public.albums(cover_asset_id) WHERE cover_asset_id IS NOT NULL;

CREATE TABLE public.album_assets (
  album_id            UUID         NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  asset_id            UUID         NOT NULL,
  family_id           UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  added_by_user_id    UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  added_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sort_index          INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, asset_id)
);

CREATE INDEX album_assets_asset_idx  ON public.album_assets(asset_id);
CREATE INDEX album_assets_family_idx ON public.album_assets(family_id, album_id, sort_index);
