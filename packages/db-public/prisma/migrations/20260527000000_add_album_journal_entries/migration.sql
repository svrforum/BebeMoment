-- Stories (diary entries) addable to albums. Mirrors album_assets but links
-- journal_entries instead of media assets (same-schema FK, no cross-schema ref).
CREATE TABLE public.album_journal_entries (
  album_id          UUID         NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  journal_entry_id  UUID         NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  family_id         UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  added_by_user_id  UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  added_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sort_index        INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, journal_entry_id)
);

CREATE INDEX album_journal_entries_entry_idx  ON public.album_journal_entries(journal_entry_id);
CREATE INDEX album_journal_entries_family_idx ON public.album_journal_entries(family_id, album_id, sort_index);
