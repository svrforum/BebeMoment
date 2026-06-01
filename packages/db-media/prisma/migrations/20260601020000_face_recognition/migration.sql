-- 얼굴 인식(옵트인): pgvector 확장 + persons/faces. cross-schema FK 없음(같은 media 스키마).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "media"."persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "name" TEXT,
    "cover_face_id" UUID,
    "face_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "persons_family_id_idx" ON "media"."persons"("family_id");

CREATE TABLE "media"."faces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "person_id" UUID,
    "bbox_x" DOUBLE PRECISION NOT NULL,
    "bbox_y" DOUBLE PRECISION NOT NULL,
    "bbox_w" DOUBLE PRECISION NOT NULL,
    "bbox_h" DOUBLE PRECISION NOT NULL,
    "det_score" DOUBLE PRECISION NOT NULL,
    "embedding" vector(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "faces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "faces_asset_id_fkey" FOREIGN KEY ("asset_id")
        REFERENCES "media"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "faces_person_id_fkey" FOREIGN KEY ("person_id")
        REFERENCES "media"."persons"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "faces_family_id_idx" ON "media"."faces"("family_id");
CREATE INDEX "faces_asset_id_idx" ON "media"."faces"("asset_id");
CREATE INDEX "faces_person_id_idx" ON "media"."faces"("person_id");
-- 코사인 유사도 ANN 인덱스(증분 군집·검색용).
CREATE INDEX "faces_embedding_idx" ON "media"."faces"
    USING hnsw ("embedding" vector_cosine_ops);

-- 역할 GRANT(신규 테이블은 자동 안 됨 — tighten_roles 가 default privileges 를 막아둠).
-- media 워커(bebe_media)=전권, web(bebe_web)=읽기 + persons 이름 수정.
GRANT ALL ON "media"."faces"   TO bebe_media;
GRANT ALL ON "media"."persons" TO bebe_media;
GRANT SELECT ON "media"."faces"             TO bebe_web;
GRANT SELECT, UPDATE ON "media"."persons"   TO bebe_web;
