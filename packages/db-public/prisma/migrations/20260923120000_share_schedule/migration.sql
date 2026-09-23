-- 일정 공유 링크. 일정이 지워지면(하드 삭제) 링크도 함께 사라진다. soft delete 된 일정은
-- 공개 페이지가 deleted_at 을 보고 거절한다.
ALTER TABLE public.share_links
  ADD COLUMN schedule_entry_id uuid REFERENCES public.schedule_entries(id) ON DELETE CASCADE;

CREATE INDEX share_links_family_schedule_idx ON public.share_links (family_id, schedule_entry_id);
