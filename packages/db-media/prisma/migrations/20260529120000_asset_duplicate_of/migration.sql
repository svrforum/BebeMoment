-- 중복 업로드 별칭: 같은 family·sha256 재업로드 시 워커가 기존(canonical) 자산의 표시
-- 필드를 복사해 ready 별칭으로 만들고, 이 컬럼에 canonical asset id 를 기록한다.
ALTER TABLE media.assets ADD COLUMN duplicate_of UUID;
CREATE INDEX assets_duplicate_of_idx ON media.assets (duplicate_of) WHERE duplicate_of IS NOT NULL;
