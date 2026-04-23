-- CreateTable
CREATE TABLE "asset_likes" (
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_likes_pkey" PRIMARY KEY ("asset_id","user_id")
);

-- CreateTable
CREATE TABLE "asset_bookmarks" (
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_bookmarks_pkey" PRIMARY KEY ("asset_id","user_id")
);

-- CreateTable
CREATE TABLE "asset_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentioned_user_ids" UUID[],
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_likes_family_id_user_id_idx" ON "asset_likes"("family_id", "user_id");

-- CreateIndex
CREATE INDEX "asset_bookmarks_family_id_user_id_created_at_idx" ON "asset_bookmarks"("family_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "asset_comments_family_id_asset_id_created_at_idx" ON "asset_comments"("family_id", "asset_id", "created_at");

-- CreateIndex
CREATE INDEX "asset_comments_author_user_id_idx" ON "asset_comments"("author_user_id");

-- AddForeignKey
ALTER TABLE "asset_likes" ADD CONSTRAINT "asset_likes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_likes" ADD CONSTRAINT "asset_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_likes" ADD CONSTRAINT "asset_likes_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_bookmarks" ADD CONSTRAINT "asset_bookmarks_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_bookmarks" ADD CONSTRAINT "asset_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_bookmarks" ADD CONSTRAINT "asset_bookmarks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_comments" ADD CONSTRAINT "asset_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
