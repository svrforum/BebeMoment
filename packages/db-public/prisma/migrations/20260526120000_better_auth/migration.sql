-- Better Auth migration (Lucia → Better Auth).
--
-- Strategy (LOW RISK, approved):
--  * Keep existing bcrypt password hashes — move them into Better Auth's
--    `account` table (providerId='credential', accountId=<userId>, password=<hash>).
--  * Force one re-login — old Lucia session rows are dropped (their `id` was a
--    Lucia string; Better Auth needs token/expiresAt/updatedAt columns the old
--    rows never carried).
--  * Preserve `current_family_id` on `sessions` as a Better Auth additional field.
--
-- Hand-written SQL + `prisma migrate resolve` (repo convention, see init_public).

-- 1. sessions: drop legacy Lucia rows, add Better Auth columns.
--    Better Auth identifies the session by `token` (the signed cookie value);
--    `id` stays the PK. `expires_at`/`created_at`/`user_id`/`current_family_id`
--    already exist from init_public.
DELETE FROM public.sessions;

ALTER TABLE public.sessions
  ADD COLUMN token      text,
  ADD COLUMN ip_address text,
  ADD COLUMN user_agent text,
  ADD COLUMN updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Lucia supplied session ids as random strings; Better Auth lets the DB
-- generate them (generateId: false). Give the column a uuid default + retype
-- to match the uuid PKs of accounts/verifications/users.
ALTER TABLE public.sessions
  ALTER COLUMN id SET DATA TYPE uuid USING (gen_random_uuid()),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- token is required + unique once Better Auth owns the table. Backfilled empty
-- because we deleted all rows above; enforce NOT NULL after the column exists.
UPDATE public.sessions SET token = id WHERE token IS NULL;
ALTER TABLE public.sessions ALTER COLUMN token SET NOT NULL;
CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);

-- 2. account — Better Auth credential + (future) OAuth account storage.
CREATE TABLE public.accounts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               text        NOT NULL,
  provider_id              text        NOT NULL,
  user_id                  uuid        NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamp(3) without time zone,
  refresh_token_expires_at timestamp(3) without time zone,
  scope                    text,
  password                 text,
  created_at               timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX accounts_user_id_idx ON public.accounts USING btree (user_id);
CREATE UNIQUE INDEX accounts_provider_id_account_id_key ON public.accounts USING btree (provider_id, account_id);

-- 3. verification — Better Auth expects this model even when email verification
--    is disabled (the adapter introspects all four core models).
CREATE TABLE public.verifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text        NOT NULL,
  value      text        NOT NULL,
  expires_at timestamp(3) without time zone NOT NULL,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX verifications_identifier_idx ON public.verifications USING btree (identifier);

-- 4. Migrate existing bcrypt hashes into credential accounts so existing users
--    log in unchanged. accountId = userId is Better Auth's convention for the
--    credential provider.
INSERT INTO public.accounts (account_id, provider_id, user_id, password, created_at, updated_at)
SELECT u.id::text, 'credential', u.id, u.password_hash, now(), now()
FROM public.users u
WHERE u.password_hash IS NOT NULL;

-- NOTE on grants: the bebe_web role is created LATER, in @bebe/db-media's
-- migration sequence (bebe_roles → tighten_roles), which both run
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO bebe_web` over every existing
-- public table — including accounts/verifications, which exist by then. So no
-- explicit grant is needed (and referencing bebe_web here would fail on a fresh
-- database where the role doesn't exist yet).
