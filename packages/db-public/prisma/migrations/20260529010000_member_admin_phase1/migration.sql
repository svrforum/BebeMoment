-- Member admin Phase 1: membership suspension + password reset tokens.
-- Hand-written (cross-schema FK forbids `migrate dev`). Same-schema FKs only.

ALTER TABLE public.memberships
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspended_reason TEXT,
  ADD COLUMN suspended_by_user_id UUID,
  ADD CONSTRAINT memberships_suspended_by_user_id_fkey
    FOREIGN KEY (suspended_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX memberships_suspended_at_idx ON public.memberships (suspended_at)
  WHERE suspended_at IS NOT NULL;

CREATE TABLE public.password_reset_tokens (
  id                 UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token              TEXT         NOT NULL UNIQUE,
  user_id            UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  issued_by_user_id  UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at         TIMESTAMPTZ  NOT NULL,
  used_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_used_idx
  ON public.password_reset_tokens (user_id, used_at);
CREATE INDEX password_reset_tokens_token_idx
  ON public.password_reset_tokens (token);
