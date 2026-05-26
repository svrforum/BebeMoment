-- Push notifications — user-scoped tables (not family-scoped).
-- Queried by user_id, like sessions / oidc_identities.

CREATE TABLE public.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL UNIQUE,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE public.notification_prefs (
  user_id   UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category  TEXT    NOT NULL,
  enabled   BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category)
);
