# asr_server.py
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, PlainTextResponse
from faster_whisper import WhisperModel
import tempfile
import os
import numpy as np
import soundfile as sf

# ---------------------------
# Конфиг через переменные окружения
# ---------------------------
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")          # tiny/base/small/medium
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "int8")       # int8/int8_float16/float16/float32
ASR_DEVICE = os.getenv("ASR_DEVICE", "cpu")               # cpu/cuda
VAD_MIN_SIL_MS = int(os.getenv("VAD_MIN_SIL_MS", "250"))  # мс тишины между фразами

# ---------------------------
# Приложение и модель
# ---------------------------
app = FastAPI(title="Dhikr ASR", version="1.0.0")

# Загружаем модель один раз
model = WhisperModel(MODEL_SIZE, device=ASR_DEVICE, compute_type=COMPUTE_TYPE)


# Прогрев модели на старте (Windows-friendly)
@app.on_event("startup")
def warmup():
    try:
        # 1 секунда тишины @16kHz
        data = np.zeros(16000, dtype="float32")
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp_path = tmp.name
        tmp.close()  # ВАЖНО для Windows — закрыть перед записью/чтением

        # Пишем wav
        sf.write(tmp_path, data, 16000)

        # Прогоняем через модель (быстрые параметры)
        _ = list(
            model.transcribe(
                tmp_path,
                beam_size=1,
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=VAD_MIN_SIL_MS),
            )[0]
        )
    except Exception as e:
        print(f"[ASR] Warmup error: {e}")
    finally:
        try:
            os.remove(tmp_path)  # На Windows может быть занят — тихо игнорим
        except Exception:
            pass
    print("[ASR] Warmup complete")


@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"


@app.get("/version")
def version():
    return {
        "model": MODEL_SIZE,
        "compute_type": COMPUTE_TYPE,
        "device": ASR_DEVICE,
        "vad_min_silence_ms": VAD_MIN_SIL_MS,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("auto"),  # "auto" | "ar" | "en" | ...
):
    """
    Принимает аудио-файл и возвращает:
    {
      "text": "<распознанный текст>",
      "conf": <эвристическая уверенность 0..1>
    }
    """
    # Сохраняем во временный файл (Windows-friendly)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}")
    tmp_path = tmp.name
    tmp.close()

    try:
        content = await file.read()

        # Быстрый отсев «пустых» — очень маленькие файлы
        if not content or len(content) < 1024:  # <1KB почти всегда пусто
            return JSONResponse({"text": "", "conf": 0.0})

        # Пишем содержимое на диск
        with open(tmp_path, "wb") as f:
            f.write(content)

        # Быстрые параметры для CPU:
        # - beam_size=1 (greedy)
        # - temperature=0.0
        # - condition_on_previous_text=False
        # - vad_filter=True (режет тишину)
        segments, info = model.transcribe(
            tmp_path,
            language=None if lang == "auto" else lang,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=VAD_MIN_SIL_MS),
        )

        text_parts = []
        confidences = []

        for seg in segments:
            # Отбрасываем пустяки
            if not getattr(seg, "text", None):
                continue

            seg_text = seg.text.strip()
            if seg_text:
                text_parts.append(seg_text)

            # Эвристический перевод avg_logprob -> [0..1]
            avg_lp = getattr(seg, "avg_logprob", None)
            if avg_lp is not None:
                # 1 + avg_logprob ~ в [0..1] для типичных значений
                c = max(0.0, min(1.0, 1.0 + float(avg_lp)))
                confidences.append(c)

        text = " ".join(text_parts).strip()
        conf = float(sum(confidences) / len(confidences)) if confidences else 0.5

        return JSONResponse({"text": text, "conf": conf})

    finally:
        # Аккуратно удаляем tmp; на Windows файл может быть занят — игнорим ошибки
        try:
            os.remove(tmp_path)
        except Exception:
            pass
