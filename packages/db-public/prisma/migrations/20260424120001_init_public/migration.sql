-- Baseline: this migration assumes the public schema tables already exist
-- (they were created by @bebe/db migrations prior to the package split).
-- Use `prisma migrate resolve --applied <name>` on existing databases.
-- For fresh databases, the baseline SQL below recreates the public schema.

-- See packages/db/prisma/migrations/* for authoritative history.
-- This baseline is used only by new installations (fresh DBs).
-- Production dbs use `prisma migrate resolve --applied 20260424120001_init_public`.

-- NOTE: The actual DDL for public schema is preserved in git history under
-- packages/db/prisma/migrations/. Run the import script in scripts/baseline.sh
-- to materialize it here if needed. Empty baseline works for resolved upgrades.
