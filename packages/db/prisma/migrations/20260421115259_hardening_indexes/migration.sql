-- CreateIndex
CREATE INDEX "assets_timeline_idx" ON "assets"("family_id", "status", "taken_at", "id");

-- Invite: partial unique for pending invites per family+email
CREATE UNIQUE INDEX "invites_pending_unique"
  ON "invites" ("family_id", lower("email"))
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- Asset: partial index for timeline (ready + not deleted) — more efficient than the plain compound index
CREATE INDEX IF NOT EXISTS "assets_ready_timeline_idx"
  ON "assets" ("family_id", "taken_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ready';
