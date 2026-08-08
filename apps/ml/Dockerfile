FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# numpy 먼저(insightface 빌드가 numpy 헤더 필요).
COPY requirements.txt .
RUN pip install --no-cache-dir numpy==1.26.4 \
 && pip install --no-cache-dir -r requirements.txt

COPY main.py .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
