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
DET_SIZE = int(os.environ.get("FACE_DET_SIZE", "640"))

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
                m.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))
                _model = m
    return _model


@app.get("/health")
def health():
    return {"ok": True, "modelLoaded": _model is not None, "pack": PACK}


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
        x1, y1, x2, y2 = (float(v) for v in f.bbox)
        out.append(
            {
                # 0..1 정규화 — 표시 파생물 크기와 무관하게 크롭 가능.
                "bbox": {
                    "x": max(0.0, x1 / w),
                    "y": max(0.0, y1 / h),
                    "w": min(1.0, (x2 - x1) / w),
                    "h": min(1.0, (y2 - y1) / h),
                },
                "embedding": [float(v) for v in f.normed_embedding],
                "score": float(f.det_score),
            }
        )
    return {"width": w, "height": h, "faces": out}
