FROM python:3.13-slim

# libgomp1 = onnxruntime, libglib2.0-0 = opencv-headless. 컴파일러는 필요 없다 —
# insightface 1.x 는 순수 파이썬 휠이고 나머지도 전부 manylinux 휠로 온다.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-insightface.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir --no-deps -r requirements-insightface.txt

COPY main.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
