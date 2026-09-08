-- media.assets_v_public 은 애플리케이션이 읽지 않는다.
--
-- Phase A 는 "web 은 이 뷰로만 asset 을 본다"는 설계였지만, apps/web 은 @bebe/db-media 로
-- media 스키마를 직접 읽고 쓴다(bebe_media 연결). 뷰를 참조하는 코드는 테스트 두 곳뿐이고,
-- 뷰 자체도 그 뒤 추가된 public_no·duplicate_of 가 없어 지금의 쿼리를 대신하지 못한다.
--
-- 그래도 지우지 않는 이유: 아무도 안 읽는 뷰는 비용이 없고, DROP 은 기존 배포에서 이 객체에
-- 걸린 GRANT 까지 같이 없앤다. 대신 사실을 데이터베이스 안에 적어 둔다 — 다음 사람이 \dv+ 로
-- 바로 볼 수 있게.
COMMENT ON VIEW media.assets_v_public IS
  'UNUSED as of 2026-09: no application code reads this view (apps/web queries media.assets directly over the bebe_media connection). Stale, too - it lacks public_no and duplicate_of. Kept so existing deployments keep the object and its grant.';
