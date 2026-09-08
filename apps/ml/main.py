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
# SCRFD 는 똑바로 선 얼굴 위주로 학습돼, 누워서 찍은 사진(아기를 안고 옆으로 기울인 컷)의
# 90° 돌아간 얼굴을 통째로 놓친다 — 실제 라이브 데이터에서 얼굴 0개로 나온 사진 37장 중
# 9장이 돌리면 얼굴이 나왔다. 그래서 **0개일 때만** 90°/270° 로 한 번씩 더 본다(0개인
# 사진에서만 도는 비용이고, 대부분의 사진은 첫 시도에 끝난다). 좌표는 원본 기준으로 되돌린다.
ROTATION_FALLBACK = os.environ.get("FACE_ROTATION_FALLBACK", "true").lower() not in (
    "0",
    "false",
    "no",
)

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


def _detect(model, img) -> list[dict]:
    """한 장에서 얼굴을 뽑아 0..1 정규화 bbox 로 돌려준다(회전 보정 전, 이 이미지 기준)."""
    h, w = img.shape[:2]
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
    return out


def _iou(a: dict, b: dict) -> float:
    """정규화 bbox 두 개의 교집합/합집합 — 회전마다 잡힌 같은 얼굴을 한 번만 남기려고."""
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    iw = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    ih = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = iw * ih
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union > 0 else 0.0


def unrotate_bbox(box: dict, k: int) -> dict:
    """`np.rot90(img, k)` 에서 잡힌 정규화 bbox 를 원본 좌표계로 되돌린다.

    k=1 은 반시계 90°(원본의 오른쪽 변이 위로 온다), k=3 은 시계 90°.
    회전된 이미지의 (x, y, w, h) 는 원본에서 축이 바뀌므로 w/h 도 맞바꾼다.
    """
    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    if k % 4 == 1:
        return {"x": y, "y": 1.0 - x - w, "w": h, "h": w}
    if k % 4 == 3:
        return {"x": 1.0 - y - h, "y": x, "w": h, "h": w}
    if k % 4 == 2:
        return {"x": 1.0 - x - w, "y": 1.0 - y - h, "w": w, "h": h}
    return dict(box)


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
    out = _detect(model, img)
    rotated: list[int] = []
    if not out and ROTATION_FALLBACK:
        # 두 방향 모두 본다 — 한 사진 안에서도 얼굴마다 기울기가 달라(안은 사람과 안긴
        # 아기) 한쪽에서만 잡히는 경우가 있다. 겹치는 탐지는 IoU 로 한 번만 남긴다.
        for k in (1, 3):
            for f in _detect(model, np.ascontiguousarray(np.rot90(img, k))):
                f["bbox"] = unrotate_bbox(f["bbox"], k)
                if any(_iou(f["bbox"], g["bbox"]) > 0.5 for g in out):
                    continue
                out.append(f)
                deg = 90 if k == 1 else 270
                if deg not in rotated:
                    rotated.append(deg)
    return {"width": w, "height": h, "faces": out, "rotated": rotated}
