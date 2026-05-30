-- SNS 앱-로그인 핸드오프(1회용 코드). user-scoped.
CREATE TABLE "public"."app_auth_handoffs" (
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "current_family_id" UUID,
    "verifier_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    CONSTRAINT "app_auth_handoffs_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "app_auth_handoffs_expires_at_idx" ON "public"."app_auth_handoffs"("expires_at");

ALTER TABLE "public"."app_auth_handoffs" ADD CONSTRAINT "app_auth_handoffs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
