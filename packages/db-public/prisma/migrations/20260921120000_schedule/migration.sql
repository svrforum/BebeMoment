-- 일정과 날짜 없는 할 일은 한 테이블이다. on_date 가 null 이면 할 일 목록에만 뜬다.
-- 종일 여부에 별도 불리언을 두지 않는다 — start_minute IS NULL 이 곧 종일이다.
CREATE TABLE public.schedule_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  baby_id             uuid REFERENCES public.babies(id) ON DELETE SET NULL,
  title               text NOT NULL,
  memo                text,
  on_date             date,
  start_minute        integer,
  repeat_yearly       boolean NOT NULL DEFAULT false,
  repeat_until        date,
  done_at             timestamp(3),
  done_by_user_id     uuid REFERENCES public.users(id),
  created_by_user_id  uuid NOT NULL REFERENCES public.users(id),
  created_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          timestamp(3),
  CONSTRAINT schedule_entries_start_minute_range
    CHECK (start_minute IS NULL OR (start_minute >= 0 AND start_minute <= 1439)),
  CONSTRAINT schedule_entries_timed_needs_date
    CHECK (start_minute IS NULL OR on_date IS NOT NULL),
  CONSTRAINT schedule_entries_repeat_needs_date
    CHECK (repeat_yearly = false OR on_date IS NOT NULL),
  CONSTRAINT schedule_entries_until_needs_repeat
    CHECK (repeat_until IS NULL OR repeat_yearly = true)
);
CREATE INDEX schedule_entries_family_date_idx ON public.schedule_entries (family_id, on_date);
CREATE INDEX schedule_entries_family_done_idx ON public.schedule_entries (family_id, done_at);
CREATE INDEX schedule_entries_family_repeat_idx ON public.schedule_entries (family_id, repeat_yearly);

CREATE TABLE public.schedule_checklist_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  entry_id         uuid NOT NULL REFERENCES public.schedule_entries(id) ON DELETE CASCADE,
  label            text NOT NULL,
  position         integer NOT NULL,
  done_at          timestamp(3),
  done_by_user_id  uuid REFERENCES public.users(id),
  created_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX schedule_checklist_items_entry_idx
  ON public.schedule_checklist_items (family_id, entry_id, position);

-- 시각 일정은 lead_minutes 한 쪽만, 종일 일정은 (days_before, at_minute) 한 쌍만 채운다.
-- 종일 일정에 시각이 없으면 생일 알림이 자정에 울린다.
CREATE TABLE public.schedule_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  entry_id      uuid NOT NULL REFERENCES public.schedule_entries(id) ON DELETE CASCADE,
  lead_minutes  integer,
  days_before   integer,
  at_minute     integer,
  created_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT schedule_reminders_one_shape CHECK (
    (lead_minutes IS NOT NULL AND days_before IS NULL AND at_minute IS NULL)
    OR (lead_minutes IS NULL AND days_before IS NOT NULL AND at_minute IS NOT NULL)
  ),
  CONSTRAINT schedule_reminders_ranges CHECK (
    (lead_minutes IS NULL OR (lead_minutes >= 0 AND lead_minutes <= 43200))
    AND (days_before IS NULL OR (days_before >= 0 AND days_before <= 30))
    AND (at_minute IS NULL OR (at_minute >= 0 AND at_minute <= 1439))
  )
);
CREATE UNIQUE INDEX schedule_reminders_unique_spec
  ON public.schedule_reminders (entry_id, COALESCE(lead_minutes, -1), COALESCE(days_before, -1), COALESCE(at_minute, -1));
CREATE INDEX schedule_reminders_family_entry_idx ON public.schedule_reminders (family_id, entry_id);

-- 발송 원장. 보내기 전에 행을 먼저 선점(INSERT ... ON CONFLICT DO NOTHING)하므로
-- 워커가 재시작해도, 틱이 겹쳐도 같은 회차를 두 번 보내지 않는다.
-- occurrence_on 은 그 회차의 원래 시작 날짜다 — 회차별 수정·건너뛰기도 같은 키를 쓴다.
CREATE TABLE public.schedule_reminder_fires (
  reminder_id    uuid NOT NULL REFERENCES public.schedule_reminders(id) ON DELETE CASCADE,
  occurrence_on  date NOT NULL,
  family_id      uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  state          text NOT NULL,
  fired_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reminder_id, occurrence_on),
  CONSTRAINT schedule_reminder_fires_state
    CHECK (state IN ('sent', 'skipped_past', 'failed'))
);
CREATE INDEX schedule_reminder_fires_family_idx ON public.schedule_reminder_fires (family_id, fired_at);
