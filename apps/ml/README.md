# bebe-ml — 얼굴 인식 사이드카 (옵트인)

InsightFace 기반 상태 없는 얼굴 추론 서비스. 얼굴인식 기능을 켠 인스턴스만 띄운다.

- `POST /faces` (multipart `file`) → `{ width, height, faces: [{ bbox{x,y,w,h 0..1}, embedding[512], score }] }`
- `POST /warmup` → 모델 로드/다운로드 트리거
- `GET /health`

env: `FACE_MODEL_PACK`(기본 buffalo_l), `FACE_MODEL_ROOT`(/data/insightface), `FACE_DET_SIZE`(640).
모델은 첫 요청/warmup 시 insightface 가 받아 `FACE_MODEL_ROOT` 에 캐시.
