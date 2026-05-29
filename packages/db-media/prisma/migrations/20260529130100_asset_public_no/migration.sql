-- 사진 순차 공개번호(public_no) — URL /detail/<n> 용. 생성순 backfill 후 시퀀스 default.
CREATE SEQUENCE media.assets_public_no_seq;
ALTER TABLE media.assets ADD COLUMN public_no INT;
WITH o AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM media.assets)
UPDATE media.assets a SET public_no = o.rn FROM o WHERE a.id = o.id;
SELECT setval('media.assets_public_no_seq', GREATEST((SELECT COALESCE(MAX(public_no),0) FROM media.assets), 1));
ALTER TABLE media.assets ALTER COLUMN public_no SET DEFAULT nextval('media.assets_public_no_seq');
ALTER TABLE media.assets ALTER COLUMN public_no SET NOT NULL;
CREATE UNIQUE INDEX assets_public_no_key ON media.assets(public_no);
