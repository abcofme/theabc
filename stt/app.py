"""Распознавание речи для диктовки в дневнике.

GigaAM v3 (Сбер, лицензия MIT) через onnx-asr на CPU: русский с пунктуацией, запись дневника не покидает сервер.
Длинную запись режем по паузам (Silero VAD): модель рассчитана на отрывки до ~25 секунд.
Наружу не открыт — сюда ходит только api (POST /api/diary/transcribe).
"""
import asyncio
import io
import re

import av
import numpy as np
import onnx_asr
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Request

SAMPLE_RATE = 16000
# Ограничение диктовки на фронте — 3 минуты (diary/src/features/diary/useDictation.js), здесь с запасом
MAX_SECONDS = 4 * 60

# На сервере 2 vCPU: одна запись за раз на оба ядра, остальные ждут в очереди
_options = ort.SessionOptions()
_options.intra_op_num_threads = 2
_options.inter_op_num_threads = 1
_cpu = ["CPUExecutionProvider"]
_model = onnx_asr.load_model("gigaam-v3-e2e-rnnt", quantization="int8", sess_options=_options, providers=_cpu)
_vad = onnx_asr.load_vad("silero", sess_options=_options, providers=_cpu)
# Режем только на заметных паузах: на каждой короткой модель ставила бы точку посреди фразы
_recognizer = _model.with_vad(_vad, min_silence_duration_ms=700, max_speech_duration_s=22)
_lock = asyncio.Lock()

app = FastAPI(title="TheABC STT", docs_url=None, redoc_url=None)


class TooLong(Exception):
    pass


class BadAudio(Exception):
    pass


def _decode(data: bytes) -> np.ndarray:
    """Любой формат записи браузера (webm/opus, mp4/aac, ogg) → моно 16 кГц float32"""
    with av.open(io.BytesIO(data)) as container:
        resampler = av.AudioResampler(format="flt", layout="mono", rate=SAMPLE_RATE)
        chunks = []
        for frame in container.decode(audio=0):
            chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
            if sum(map(len, chunks)) > MAX_SECONDS * SAMPLE_RATE:
                raise TooLong
        chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    return np.concatenate(chunks).astype(np.float32) if chunks else np.zeros(0, np.float32)


def _join(parts: list[str]) -> str:
    """Склеивает отрывки. Если пауза пришлась на середину фразы, отрывок после нее начинается с заглавной — убираем"""
    text = ""
    for part in (p.strip() for p in parts):
        if not part:
            continue
        if text and not re.search(r"[.!?…]$", text):
            part = part[0].lower() + part[1:]
        text = f"{text} {part}" if text else part
    return text


def _recognize(data: bytes) -> str:
    try:
        waveform = _decode(data)
    except TooLong:
        raise
    except Exception as error:
        raise BadAudio from error
    if len(waveform) < SAMPLE_RATE // 4:
        return ""
    return _join([segment.text for segment in _recognizer.recognize(waveform)])


@app.post("/transcribe")
async def transcribe(request: Request):
    data = await request.body()
    async with _lock:
        try:
            text = await asyncio.to_thread(_recognize, data)
        except TooLong:
            raise HTTPException(status_code=413, detail="too long")
        except BadAudio:
            raise HTTPException(status_code=422, detail="bad audio")
    return {"text": text}


@app.get("/health")
async def health():
    return {"ok": True}
