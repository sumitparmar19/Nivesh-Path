# Container image for the Nivesh-Path AI advisor (FastAPI + Claude + ChromaDB).
FROM python:3.11-slim
# Links the image published to GHCR (by CI) to this repository.
LABEL org.opencontainers.image.source="https://github.com/sumitparmar19/Nivesh-Path"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROMA_PERSIST_DIR=/data/chroma

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN useradd --create-home appuser && mkdir -p /data/chroma && chown -R appuser /data
USER appuser

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
