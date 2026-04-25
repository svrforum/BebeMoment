-- Journal-entry visibility scope. Composer-style posts can be limited to
-- "guardians only" (owner + guardian roles) — useful for sensitive notes
-- that a family viewer (e.g., a relative invited just to view photos)
-- shouldn't see.

CREATE TYPE public.journal_visibility AS ENUM ('family', 'guardians');

ALTER TABLE public.journal_entries
  ADD COLUMN visibility public.journal_visibility NOT NULL DEFAULT 'family';

CREATE INDEX journal_entries_visibility_idx
  ON public.journal_entries(family_id, visibility, entry_date DESC);
