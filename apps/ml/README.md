# bebe-ml — 얼굴 인식 사이드카 (옵트인)

InsightFace 기반 상태 없는 얼굴 추론 서비스. 얼굴인식 기능을 켠 인스턴스만 띄운다
(compose 프로필 `faces`).

- `POST /faces` (multipart `file`) → `{ width, height, faces: [{ bbox{x,y,w,h 0..1}, embedding[512], score }] }`
- `POST /warmup` → 모델 로드/다운로드 트리거
- `GET /health` → 항상 200(닿는지 확인용). 모델 준비 상태는 `modelLoaded`·`modelFilesPresent`·
  `modelError` 필드로 본다 — 관리자 화면(`/api/admin/faces/health`)이 상태코드를 "닿는다"로
  읽기 때문에 모델이 안 올라왔다고 5xx 를 주면 안 된다.

모델은 기동 직후 백그라운드로 올린다(첫 요청이 20초씩 걸리지 않게). 캐시가 없으면
insightface 가 받아 `FACE_MODEL_ROOT` 에 저장하고, 실패해도 기동은 막지 않는다 —
이유는 로그와 `/health.modelError` 에 남고 첫 요청 때 다시 시도한다.

`detection` 과 `recognition` 모델만 올린다. buffalo_l 기본값은 랜드마크 2종(`1k3d68` 은
혼자 143MB)과 성별/나이까지 얼굴마다 돌리는데, 이 API 응답에는 하나도 안 쓰인다.

## env

| 변수 | 기본 | 설명 |
|---|---|---|
| `FACE_MODEL_PACK` | `buffalo_l` | insightface 모델팩 |
| `FACE_MODEL_ROOT` | `/data/insightface` | 모델 캐시(볼륨) |
| `FACE_DET_SIZE` | `800` | 탐지 입력 한 변 |
| `FACE_DET_THRESH` | `0.3` | 탐지 임계값 |
| `FACE_MIN_SIZE` | `0.05` | 정규화 w/h 하한 — 작은 오탐 컷(주 필터) |
| `FACE_MIN_SCORE` | `0.3` | 점수 하한(보조 필터) |
| `FACE_MAX_UPLOAD_MB` | `64` | 이보다 큰 요청은 413 |
| `FACE_MAX_PIXELS` | `80` (백만 픽셀) | 디코드 후 이보다 큰 이미지는 413 |
| `PUID` / `PGID` | `1000` | 서버 프로세스가 이 uid/gid 로 내려간다 |

## 컨테이너

root 로 뜨면 엔트리포인트가 `FACE_MODEL_ROOT` 소유자를 `PUID:PGID` 로 맞춘 뒤 권한을
떨군다 — 첫 기동에 모델을 받아야 하는데 볼륨 소유자는 제각각이기 때문. uvicorn 은 항상
비특권으로 돈다.

의존성은 `requirements.txt` 에 전부 핀으로 박혀 있다. insightface 만
`requirements-insightface.txt` 에 따로 두고 `--no-deps` 로 설치한다(이유는 그 파일 주석).

## ⚠️ 스택을 올릴 때: 임베딩이 바뀌면 저장된 벡터가 무의미해진다

`media.faces.embedding` 은 pgvector 에 그대로 쌓이고 인물 군집은 코사인 거리
(`<=>`, 임계값 `DEFAULT_FACE_CLUSTER_DISTANCE` = 0.45)로 판단한다. 같은 얼굴에서
다른 벡터가 나오는 순간 **이미 만들어진 인물이 전부 어긋난다** — 사람 이름이 붙은
데이터라 조용히 깨지면 알아채기도 어렵다.

그래서 onnxruntime·insightface·opencv·numpy 를 올릴 때는 올리기 전에 같은 사진으로
같은 얼굴의 임베딩을 뽑아 **코사인 유사도**를 비교한다. 모델 가중치
(`FACE_MODEL_ROOT` 의 onnx 파일)를 양쪽에서 똑같이 두고 런타임만 바꿔서 재면 된다.

- 유사도 ≥ 0.999 → 군집 임계값(0.45) 대비 여유가 3자릿수라 그대로 올려도 된다.
- 그보다 낮으면 재색인(전 자산 얼굴 재검출) 없이는 올리지 않는다.

2026-09 스택 갱신(py3.11→3.13, ort 1.20→1.29, insightface 0.7.3→1.0.1, numpy 1.26→2.5,
opencv 4.10→5.0)에서 실측: 얼굴 52개 기준 bbox·det_score 는 **비트 단위로 동일**,
임베딩 코사인 유사도 최저 0.99980(최대 코사인 거리 2.0e-4). 저장된 벡터는 유효하다.
