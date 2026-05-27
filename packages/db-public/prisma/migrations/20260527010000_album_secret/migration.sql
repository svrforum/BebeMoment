-- Secret albums: visible only to owner/guardian (parents). Default false.
ALTER TABLE public.albums ADD COLUMN is_secret BOOLEAN NOT NULL DEFAULT false;
