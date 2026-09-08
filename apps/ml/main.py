"""bebe ML 사이드카 — 상태 없는 얼굴 추론(InsightFace). 이미지 바이트 입력 →
얼굴 [{bbox(0..1), embedding(512), score}] 출력. DB·저장은 호출자(Node 미디어 워커)가 한다.
모델은 켤 때(기동 직후 백그라운드 / 첫 요청 / warmup) insightface 가 받아 볼륨에 캐시한다."""
import os
import os.path as osp
import sys
import threading
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

PACK = os.environ.get("FACE_MODEL_PACK", "buffalo_l")
ROOT = os.environ.get("FACE_MODEL_ROOT", "/data/insightface")
# 아기 사진 튜닝: buffalo_l(SCRFD, 성인 학습)은 클로즈업 아기 얼굴을 자주 놓친다.
# det_size 키워(작은/다양한 포즈) + det_thresh 낮춰(저신뢰 아기 얼굴까지) 탐지율을 올린다.
# 오탐이 늘면 호출자(미디어 워커)에서 score 로 거를 수 있으나, 우선 recall 우선.
DET_SIZE = int(os.environ.get("FACE_DET_SIZE", "800"))
DET_THRESH = float(os.environ.get("FACE_DET_THRESH", "0.3"))
# 후처리 필터(오탐 제거). det_thresh 를 낮춰 아기 얼굴까지 잡으면 작은 비-얼굴 패치도
# 같이 잡힌다 — 실제 노이즈는 **아주 작은**(w/h ~0.01~0.02) 탐지였고 진짜 얼굴(아기
# 클로즈업)은 크다(w~0.23). 그래서 최소 크기로 거른다(주 필터). 점수 하한은 보조.
MIN_SIZE = float(os.environ.get("FACE_MIN_SIZE", "0.05"))  # min(정규화 w, h)
MIN_SCORE = float(os.environ.get("FACE_MIN_SCORE", "0.3"))
# 입력 상한. 미디어 워커는 보통 1080 파생물(수백 KB)을 보내고, 파생물이 없으면 원본을
# 그대로 보낸다 — 그래서 실사진은 절대 안 걸릴 만큼 넉넉히 두되 무한정 받지는 않는다.
MAX_UPLOAD_BYTES = int(float(os.environ.get("FACE_MAX_UPLOAD_MB", "64")) * 1024 * 1024)
MAX_PIXELS = int(float(os.environ.get("FACE_MAX_PIXELS", "80")) * 1_000_000)

_model = None
_load_error: str | None = None
_lock = threading.Lock()


def model_files_present() -> bool:
    return osp.isdir(osp.join(ROOT, "models", PACK))


def get_model():
    global _model, _load_error
    if _model is None:
        with _lock:
            if _model is None:
                from insightface.app import FaceAnalysis

                try:
                    # 우리가 쓰는 건 bbox·det_score·normed_embedding 뿐이다. 기본값은
                    # 랜드마크 2종(1k3d68 은 혼자 143MB)과 성별/나이까지 올려 얼굴마다
                    # 돌린다 — 결과에 안 쓰이면서 세션(=스레드풀)만 5개가 된다.
                    m = FaceAnalysis(
                        name=PACK,
                        root=ROOT,
                        allowed_modules=["detection", "recognition"],
                        providers=["CPUExecutionProvider"],
                    )
                    m.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE), det_thresh=DET_THRESH)
                except Exception as e:  # 모델 다운로드 실패 등 — 조용히 죽지 않는다(§6).
                    _load_error = f"{type(e).__name__}: {e}"
                    raise
                _model = m
                _load_error = None
    return _model


def _warm():
    try:
        get_model()
    except Exception as e:
        # 삼키지 않는다(§6) — 로그로 남기고 /health.modelError 로도 보인다.
        # 첫 요청이 오면 다시 시도한다.
        print(f"model load failed: {type(e).__name__}: {e}", file=sys.stderr, flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 첫 요청이 20초씩 걸리지 않게 미리 올린다. 실패해도 기동은 막지 않는다 —
    # 오프라인 첫 기동(모델 미다운로드)에서 컨테이너가 죽어버리면 진단이 더 어렵다.
    threading.Thread(target=_warm, name="warmup", daemon=True).start()
    yield


app = FastAPI(title="bebe-ml", lifespan=lifespan)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    # 멀티파트 파싱(디스크 스풀)이 시작되기 전에 자른다.
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        return JSONResponse({"detail": "payload too large"}, status_code=413)
    return await call_next(request)


@app.get("/health")
def health():
    # 항상 200 — 관리자 화면(web /api/admin/faces/health)은 res.ok 를 "닿는다"로 읽는다.
    # 모델 준비 상태는 상태코드가 아니라 필드로 알린다.
    return {
        "ok": True,
        "modelLoaded": _model is not None,
        "modelFilesPresent": model_files_present(),
        "modelRoot": ROOT,
        "modelError": _load_error,
        "pack": PACK,
        "detSize": DET_SIZE,
        "detThresh": DET_THRESH,
        "minSize": MIN_SIZE,
        "minScore": MIN_SCORE,
        "maxUploadBytes": MAX_UPLOAD_BYTES,
    }


@app.post("/warmup")
def warmup():
    get_model()
    return {"ok": True, "pack": PACK}


@app.post("/faces")
async def faces(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="payload too large")
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)  # BGR
    if img is None:
        raise HTTPException(status_code=400, detail="invalid image")
    h, w = img.shape[:2]
    if h * w > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="image too large")
    model = get_model()
    out = []
    for f in model.get(img):
        score = float(f.det_score)
        if score < MIN_SCORE:
            continue
        x1, y1, x2, y2 = (float(v) for v in f.bbox)
        bw = min(1.0, (x2 - x1) / w)
        bh = min(1.0, (y2 - y1) / h)
        # 너무 작은 탐지는 비-얼굴 오탐일 가능성이 높아 버린다(주 필터).
        if min(bw, bh) < MIN_SIZE:
            continue
        out.append(
            {
                # 0..1 정규화 — 표시 파생물 크기와 무관하게 크롭 가능.
                "bbox": {"x": max(0.0, x1 / w), "y": max(0.0, y1 / h), "w": bw, "h": bh},
                "embedding": [float(v) for v in f.normed_embedding],
                "score": score,
            }
        )
    return {"width": w, "height": h, "faces": out}
