-- Per-user diary entry bookmarks. Mirrors public.asset_bookmarks but targets
-- journal_entries (same-schema FK only — no cross-schema reference).
CREATE TABLE public.journal_bookmarks (
  entry_id    UUID         NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  family_id   UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, user_id)
);

CREATE INDEX journal_bookmarks_family_user_created_idx
  ON public.journal_bookmarks(family_id, user_id, created_at);
