-- DevicePushToken: native (Android/iOS) FCM tokens, user-scoped like push_subscriptions
CREATE TABLE public.device_push_tokens (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform     TEXT         NOT NULL DEFAULT 'android',
  token        TEXT         NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX device_push_tokens_user_idx ON public.device_push_tokens(user_id);
