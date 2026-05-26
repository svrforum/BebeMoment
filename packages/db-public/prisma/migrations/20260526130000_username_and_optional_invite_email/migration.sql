-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- AlterTable
ALTER TABLE "public"."invites" ALTER COLUMN "email" DROP NOT NULL;
