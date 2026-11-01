# Распознавание речи для диктовки в дневнике (app.py). Модели скачиваются при сборке:
# слой с ними не пересобирается, пока не поменяются зависимости
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import onnx_asr; onnx_asr.load_model('gigaam-v3-e2e-rnnt', quantization='int8'); onnx_asr.load_vad('silero')"

# Модели уже в образе — при запуске в сеть не ходим
ENV HF_HUB_OFFLINE=1
COPY app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
