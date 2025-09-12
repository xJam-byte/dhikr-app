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

# VAD и распознавание
DEFAULT_VAD_MIN_SIL_MS = int(os.getenv("VAD_MIN_SIL_MS", "120"))
BEAM_SIZE               = int(os.getenv("ASR_BEAM_SIZE", "5"))
TEMPERATURE             = float(os.getenv("ASR_TEMPERATURE", "0.0"))
NO_SPEECH_THRESHOLD     = float(os.getenv("ASR_NO_SPEECH_THRESHOLD", "0.6"))
LOG_PROB_THRESHOLD      = float(os.getenv("ASR_LOG_PROB_THRESHOLD", "-1.0"))
COMPRESSION_RATIO_TH    = float(os.getenv("ASR_COMPRESSION_RATIO_TH", "2.4"))

# Порог для отбора слов в words (можно подкрутить)
WORD_MIN_PROB           = float(os.getenv("ASR_WORD_MIN_PROB", "0.0"))

app = FastAPI(title="Dhikr ASR", version="1.3.0")

# Модель грузим один раз
model = WhisperModel(MODEL_SIZE, device=ASR_DEVICE, compute_type=COMPUTE_TYPE)

def has_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text or ""))

@app.on_event("startup")
def warmup():
    tmp_path = None
    try:
        # 1 сек тишины, 16kHz
        data = np.zeros(16000, dtype="float32")
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp_path = tmp.name
        tmp.close()
        sf.write(tmp_path, data, 16000)

        # Лёгкий прогрев модели
        _ = list(model.transcribe(
            tmp_path,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=DEFAULT_VAD_MIN_SIL_MS),
            word_timestamps=True,  # прогреваем путь слов
            no_speech_threshold=NO_SPEECH_THRESHOLD,
            log_prob_threshold=LOG_PROB_THRESHOLD,
            compression_ratio_threshold=COMPRESSION_RATIO_TH,
        )[0])
    except Exception as e:
        print(f"[ASR] Warmup error: {e}")
    finally:
        if tmp_path:
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
        "beam_size": BEAM_SIZE,
        "temperature": TEMPERATURE,
        "no_speech_threshold": NO_SPEECH_THRESHOLD,
        "log_prob_threshold": LOG_PROB_THRESHOLD,
        "compression_ratio_threshold": COMPRESSION_RATIO_TH,
        "word_min_prob": WORD_MIN_PROB,
    }

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("auto"),               # "auto" | "ar" | "en" | ...
    vad_min_sil_ms: int = Form(DEFAULT_VAD_MIN_SIL_MS),  # даём право переопределить
):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename or 'audio'}")
    tmp_path = tmp.name
    tmp.close()

    try:
        content = await file.read()
        if not content or len(content) < 1024:
            return JSONResponse({
                "text": "", "conf": 0.0, "segments_count": 0,
                "segments": [], "words": [], "lang": None, "has_ar": False
            })

        with open(tmp_path, "wb") as f:
            f.write(content)

        # Включаем word_timestamps и фильтры
        segments_gen, info = model.transcribe(
            tmp_path,
            language=None if lang == "auto" else lang,
            beam_size=BEAM_SIZE,
            temperature=TEMPERATURE,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=int(vad_min_sil_ms)),
            word_timestamps=True,
            no_speech_threshold=NO_SPEECH_THRESHOLD,
            log_prob_threshold=LOG_PROB_THRESHOLD,
            compression_ratio_threshold=COMPRESSION_RATIO_TH,
        )

        texts = []
        confs = []
        seg_texts = []
        words_out = []
        seg_cache = []  # для псевдо-слов, если слов не будет

        for seg in segments_gen:
            st = float(getattr(seg, "start", 0.0) or 0.0)
            en = float(getattr(seg, "end", 0.0) or 0.0)
            seg_text = (getattr(seg, "text", "") or "").strip()

            if seg_text:
                seg_texts.append(seg_text)
                texts.append(seg_text)

            avg_lp = getattr(seg, "avg_logprob", None)
            if avg_lp is not None:
                # logprob -> [0..1]
                c = max(0.0, min(1.0, 1.0 + float(avg_lp)))
                confs.append(c)

            # Копим слова
            found_words = False
            for w in getattr(seg, "words", []) or []:
                try:
                    prob = float(getattr(w, "probability", 0.0) or 0.0)
                except Exception:
                    prob = 0.0
                if prob >= WORD_MIN_PROB:
                    words_out.append({
                        "w": (getattr(w, "word", "") or "").strip(),
                        "start": float(getattr(w, "start", st) or st),
                        "end": float(getattr(w, "end", en) or en),
                        "p": prob,
                    })
                    found_words = True

            # Кэшируем сегменты для возможного псевдо-распила
            seg_cache.append({"start": st, "end": en, "text": seg_text, "has_words": found_words})

        text = " ".join(texts).strip()
        conf = float(sum(confs) / len(confs)) if confs else 0.5
        lang_code = getattr(info, "language", None)

        # Если слов нет вообще — строим псевдо-слова из сегментов
        if len(words_out) == 0 and seg_cache:
            for s in seg_cache:
                if not s["text"]:
                    continue
                tokens = [t for t in s["text"].split() if t]
                if not tokens:
                    continue
                dur = max(0.0, float(s["end"]) - float(s["start"]))
                # если модель дала сегмент "Аллаху Акбар Аллаху Акбар" — делим равномерно
                step = dur / len(tokens) if len(tokens) > 0 else 0.0
                for i, tok in enumerate(tokens):
                    ws = float(s["start"]) + step * i
                    we = float(s["start"]) + step * (i + 1) if step > 0 else float(s["end"])
                    words_out.append({"w": tok, "start": ws, "end": we, "p": 0.5})

        return JSONResponse({
            "text": text,
            "conf": conf,
            "segments_count": len(seg_texts),
            "segments": seg_texts,
            "words": words_out,        # всегда есть (реальные или псевдо)
            "lang": lang_code,
            "has_ar": has_arabic(text)
        })
    finally:
        try: os.remove(tmp_path)
        except Exception: pass
