-- 자주 쓰는 준비물 목록. 가족 단위로 공유하고, 같은 이름으로 다시 저장하면 항목을 바꾼다.
CREATE TABLE public.schedule_checklist_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name                text NOT NULL,
  items               text[] NOT NULL DEFAULT '{}',
  created_by_user_id  uuid NOT NULL REFERENCES public.users(id),
  created_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX schedule_checklist_templates_family_name_key
  ON public.schedule_checklist_templates (family_id, name);
