CREATE TABLE "public"."widget_tokens" (
  "token" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  CONSTRAINT "widget_tokens_pkey" PRIMARY KEY ("token")
);
CREATE UNIQUE INDEX "widget_tokens_user_id_key" ON "public"."widget_tokens"("user_id");
ALTER TABLE "public"."widget_tokens" ADD CONSTRAINT "widget_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
