-- 홈 위젯에 띄울 사진 컬렉션(사용자별). 북마크와 목적이 달라 별도 테이블로 둔다.
-- asset_id 는 media 스키마 자산이라 cross-schema — FK 없이 컬럼만(§17#22).
CREATE TABLE public.widget_photos (
  asset_id    UUID         NOT NULL,
  user_id     UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  family_id   UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, user_id)
);

CREATE INDEX widget_photos_family_user_sort_idx
  ON public.widget_photos(family_id, user_id, sort_order);

-- 기존 'bookmark_pinned' 고정 사진을 컬렉션 1행으로 이관. 위젯 설정은 사용자 단위이고
-- widget_tokens 에는 family_id 가 없으므로, 그 사용자의 살아있는 멤버십에서 가져온다.
INSERT INTO public.widget_photos (asset_id, user_id, family_id, sort_order)
SELECT wt.widget_pinned_asset_id, wt.user_id, m.family_id, 0
FROM public.widget_tokens wt
JOIN LATERAL (
  SELECT family_id
  FROM public.memberships
  WHERE user_id = wt.user_id AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1
) m ON TRUE
WHERE wt.widget_source = 'bookmark_pinned'
  AND wt.widget_pinned_asset_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.widget_tokens
SET widget_source = 'collection'
WHERE widget_source = 'bookmark_pinned';

ALTER TABLE public.widget_tokens DROP COLUMN widget_pinned_asset_id;
