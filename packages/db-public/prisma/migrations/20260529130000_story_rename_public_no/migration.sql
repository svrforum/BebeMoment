-- journal → story rename (테이블·enum·컬럼) + 순차 공개번호(public_no). 데이터 보존(rename),
-- public_no 는 생성순 backfill 후 시퀀스 default.
ALTER TYPE public.journal_visibility RENAME TO story_visibility;
ALTER TABLE public.journal_entries RENAME TO stories;
ALTER TABLE public.journal_entry_assets RENAME TO story_assets;
ALTER TABLE public.journal_bookmarks RENAME TO story_bookmarks;
ALTER TABLE public.album_journal_entries RENAME TO album_stories;
ALTER TABLE public.album_stories RENAME COLUMN journal_entry_id TO story_id;

CREATE SEQUENCE public.stories_public_no_seq;
ALTER TABLE public.stories ADD COLUMN public_no INT;
WITH o AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.stories)
UPDATE public.stories s SET public_no = o.rn FROM o WHERE s.id = o.id;
SELECT setval('public.stories_public_no_seq', GREATEST((SELECT COALESCE(MAX(public_no),0) FROM public.stories), 1));
ALTER TABLE public.stories ALTER COLUMN public_no SET DEFAULT nextval('public.stories_public_no_seq');
ALTER TABLE public.stories ALTER COLUMN public_no SET NOT NULL;
CREATE UNIQUE INDEX stories_public_no_key ON public.stories(public_no);
