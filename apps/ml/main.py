"""bebe ML 사이드카 — 상태 없는 얼굴 추론(InsightFace). 이미지 바이트 입력 →
얼굴 [{bbox(0..1), embedding(512), score}] 출력. DB·저장은 호출자(Node 미디어 워커)가 한다.
모델은 켤 때(첫 요청/warmup) insightface 가 받아 볼륨에 캐시한다."""
import os
import threading

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

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

app = FastAPI(title="bebe-ml")
_model = None
_lock = threading.Lock()


def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from insightface.app import FaceAnalysis

                m = FaceAnalysis(name=PACK, root=ROOT, providers=["CPUExecutionProvider"])
                m.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE), det_thresh=DET_THRESH)
                _model = m
    return _model


@app.get("/health")
def health():
    return {
        "ok": True,
        "modelLoaded": _model is not None,
        "pack": PACK,
        "detSize": DET_SIZE,
        "detThresh": DET_THRESH,
        "minSize": MIN_SIZE,
        "minScore": MIN_SCORE,
    }


@app.post("/warmup")
def warmup():
    get_model()
    return {"ok": True, "pack": PACK}


@app.post("/faces")
async def faces(file: UploadFile = File(...)):
    data = await file.read()
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)  # BGR
    if img is None:
        raise HTTPException(status_code=400, detail="invalid image")
    h, w = img.shape[:2]
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
