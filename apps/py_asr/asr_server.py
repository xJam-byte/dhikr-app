from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, PlainTextResponse
from faster_whisper import WhisperModel
import tempfile
import os
import numpy as np
import soundfile as sf
import re

# ---------------------------
# Конфиг через окружение
# ---------------------------
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")           # tiny/base/small/medium/large-v3
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "int8")       # int8/int8_float16/float16/float32
ASR_DEVICE  = os.getenv("ASR_DEVICE", "cpu")              # cpu/cuda
DEFAULT_VAD_MIN_SIL_MS = int(os.getenv("VAD_MIN_SIL_MS", "120"))  # ↓ короче паузы → лучше видны повторы

app = FastAPI(title="Dhikr ASR", version="1.1.0")

# Модель грузим один раз
model = WhisperModel(MODEL_SIZE, device=ASR_DEVICE, compute_type=COMPUTE_TYPE)

def has_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text or ""))

@app.on_event("startup")
def warmup():
    try:
        # 1 сек тишины, 16kHz
        data = np.zeros(16000, dtype="float32")
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp_path = tmp.name
        tmp.close()
        sf.write(tmp_path, data, 16000)

        _ = list(model.transcribe(
            tmp_path,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=DEFAULT_VAD_MIN_SIL_MS),
        )[0])
    except Exception as e:
        print(f"[ASR] Warmup error: {e}")
    finally:
        try: os.remove(tmp_path)
        except Exception: pass
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
        "default_vad_min_sil_ms": DEFAULT_VAD_MIN_SIL_MS,
    }

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("auto"),               # "auto" | "ar" | "en" | ...
    vad_min_sil_ms: int = Form(DEFAULT_VAD_MIN_SIL_MS),  # даём право переопределить
):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}")
    tmp_path = tmp.name
    tmp.close()

    try:
        content = await file.read()
        if not content or len(content) < 1024:
            return JSONResponse({"text": "", "conf": 0.0, "segments_count": 0, "lang": None, "has_ar": False})

        with open(tmp_path, "wb") as f:
            f.write(content)

        segments, info = model.transcribe(
            tmp_path,
            language=None if lang == "auto" else lang,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=int(vad_min_sil_ms)),
        )

        texts = []
        confs = []
        seg_texts = []

        for seg in segments:
            seg_text = (getattr(seg, "text", "") or "").strip()
            if not seg_text:
                continue
            seg_texts.append(seg_text)
            texts.append(seg_text)
            avg_lp = getattr(seg, "avg_logprob", None)
            if avg_lp is not None:
                c = max(0.0, min(1.0, 1.0 + float(avg_lp)))
                confs.append(c)

        text = " ".join(texts).strip()
        conf = float(sum(confs) / len(confs)) if confs else 0.5
        lang_code = getattr(info, "language", None)

        return JSONResponse({
            "text": text,
            "conf": conf,
            "segments_count": len(seg_texts),
            "segments": seg_texts,
            "lang": lang_code,
            "has_ar": has_arabic(text)
        })
    finally:
        try: os.remove(tmp_path)
        except Exception: pass
