-- taken_at 은 촬영 순간의 벽시계를 UTC 필드에 담는다(wall-clock-as-UTC). 타임라인·캘린더·추억이 모두
-- 그 UTC 날짜로 묶는다.
--
-- 2026-10 전까지 TZ 가 UTC 가 아닌 컨테이너(compose 기본 Asia/Seoul)에서는 EXIF 날짜가 서버 로컬
-- 시간대로 읽혀 실제 순간으로 저장됐고, 파일 수정시각·업로드 시각은 시간대와 상관없이 늘 실제 순간으로
-- 저장됐다. KST 에서 9시간 이른 값이라 아침에 찍은 사진이 전날로 묶였다. 앞으로의 업로드는 코드가 바로
-- 저장하고, 기존 행은 apps/media/src/scripts/backfill-taken-at-wall-clock.ts 가 되돌린다.
COMMENT ON COLUMN "media"."assets"."taken_at" IS
  'Capture time as the wall clock at capture, stored in UTC fields (wall-clock-as-UTC). Never a real UTC instant: read it with getUTC* / UTC day ranges.';

-- 파일 수정시각은 원래의 실제 순간을 따로 남겨 둔다. 그래야 taken_at 을 몇 번이고 같은 값으로 다시
-- 계산할 수 있다(업로드 시각이 uploaded_at 에서 다시 계산되는 것과 같다). 다시 적용돼도 안전하게 —
-- 업그레이드 전 백업을 복구하면 이력에 이 마이그레이션이 없어 한 번 더 돈다.
ALTER TABLE "media"."assets" ADD COLUMN IF NOT EXISTS "file_modified_at" TIMESTAMP(3);

COMMENT ON COLUMN "media"."assets"."file_modified_at" IS
  'Uploader file modified time (File.lastModified) as a real UTC instant. When taken_at_source = filemtime, taken_at is this moved to the instance wall clock. NULL on filemtime rows written before 2026-10: those still hold the instant in taken_at.';
