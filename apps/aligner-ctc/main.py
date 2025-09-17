# apps/aligner-ctc/main.py
import tempfile, os, io, glob, logging
from typing import List, Tuple
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, PlainTextResponse
import numpy as np
import librosa

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("dtw-aligner")

# ── config ────────────────────────────────────────────────────────────────────
app = FastAPI(title="Dhikr DTW Aligner", version="0.2.0")

TEMPLATES_ROOT   = os.getenv("TEMPLATES_ROOT", "../api/assets/zikr_templates")
SR               = int(os.getenv("SR", "16000"))

# энергия/сегментация
DTW_MIN_GAP_MS   = int(os.getenv("DTW_MIN_GAP_MS", "250"))
DTW_MIN_DUR_MS   = int(os.getenv("DTW_MIN_DUR_MS", "450"))

# окно длительностей относительно медианы шаблона (pass1)
DUR_FACTOR_LO    = float(os.getenv("DUR_FACTOR_LO", "0.55"))
DUR_FACTOR_HI    = float(os.getenv("DUR_FACTOR_HI", "1.80"))

# окно для pass2 (если pass1 дал 0 матчей)
RELAX_FACTOR_LO  = float(os.getenv("RELAX_FACTOR_LO", "0.20"))
RELAX_FACTOR_HI  = float(os.getenv("RELAX_FACTOR_HI", "3.00"))

# небольшой абсолютный люфт, чтобы не срезать сегменты «на грани»
DUR_ABS_LO_MS    = int(os.getenv("DUR_ABS_LO_MS", "80"))
DUR_ABS_HI_MS    = int(os.getenv("DUR_ABS_HI_MS", "120"))

# DTW и принятие решения
DTW_THRESHOLD    = float(os.getenv("DTW_THRESHOLD", "0.12"))
DTW_MIN_TPL_VOTES= int(os.getenv("DTW_MIN_TPL_VOTES", "2"))
DTW_TOP2_MARGIN  = float(os.getenv("DTW_TOP2_MARGIN", "0.015"))

# дополнительные эвристики принятия
MARGIN_FLOOR     = float(os.getenv("MARGIN_FLOOR", "0.006"))   # минимум «отрыва» если TOP2 близко
BEST_RELAX_RATIO = float(os.getenv("BEST_RELAX_RATIO", "0.92"))# если best < THRESH*0.92 — можно послабить margin
NEAR_MED_EPS     = float(os.getenv("NEAR_MED_EPS", "0.18"))    # ±18% от медианы — считаем «по длительности очень близко»

log.info("Aligner config: %s", {
    "TEMPLATES_ROOT": TEMPLATES_ROOT,
    "SR": SR,
    "DTW_MIN_GAP_MS": DTW_MIN_GAP_MS,
    "DTW_MIN_DUR_MS": DTW_MIN_DUR_MS,
    "DUR_FACTOR_LO": DUR_FACTOR_LO,
    "DUR_FACTOR_HI": DUR_FACTOR_HI,
    "RELAX_FACTOR_LO": RELAX_FACTOR_LO,
    "RELAX_FACTOR_HI": RELAX_FACTOR_HI,
    "DUR_ABS_LO_MS": DUR_ABS_LO_MS,
    "DUR_ABS_HI_MS": DUR_ABS_HI_MS,
    "DTW_THRESHOLD": DTW_THRESHOLD,
    "DTW_MIN_TPL_VOTES": DTW_MIN_TPL_VOTES,
    "DTW_TOP2_MARGIN": DTW_TOP2_MARGIN,
    "MARGIN_FLOOR": MARGIN_FLOOR,
    "BEST_RELAX_RATIO": BEST_RELAX_RATIO,
    "NEAR_MED_EPS": NEAR_MED_EPS,
})

# ── audio utils ───────────────────────────────────────────────────────────────

def load_audio_bytes_to_mono16k(data: bytes, guess_suffix: str = ".m4a") -> np.ndarray:
    """Надёжная загрузка байтов любого контейнера (m4a/mp3/wav/...).
       Пишем во временный файл, затем librosa.load(). Нужен ffmpeg."""
    # простое угадывание контейнера по «магии» заголовка
    if data.startswith(b"RIFF"):                       # WAV
        suffix = ".wav"
    elif data[4:8] == b"ftyp":                         # MP4/M4A
        suffix = ".m4a"
    elif data.startswith(b"ID3") or data[:2] == b"\xFF\xFB":  # MP3
        suffix = ".mp3"
    else:
        suffix = guess_suffix

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            y, sr = librosa.load(tmp_path, sr=SR, mono=True)
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
    except Exception as e:
        log.warning("load_audio_bytes_to_mono16k: failed via tempfile (%s)", e)
        return np.zeros(1, dtype=np.float32)

    if y.size == 0:
        return np.zeros(1, dtype=np.float32)
    return librosa.util.normalize(y).astype(np.float32)

def load_audio_path_to_mono16k(path: str) -> np.ndarray:
    try:
        y, sr = librosa.load(path, sr=SR, mono=True)
    except Exception as e:
        log.warning("librosa.load(%s) failed: %s", path, e)
        return np.zeros(1, dtype=np.float32)
    if y.size == 0:
        return np.zeros(1, dtype=np.float32)
    return librosa.util.normalize(y).astype(np.float32)

def seg_energy(y: np.ndarray, hop=256, frame=1024) -> np.ndarray:
    return librosa.feature.rms(y=y, frame_length=frame, hop_length=hop)[0]

def energy_segments(y: np.ndarray, hop=256, frame=1024) -> List[Tuple[int,int]]:
    rms = seg_energy(y, hop, frame)
    thr = max(0.05, np.percentile(rms, 75) * 0.6)
    on = rms >= thr
    segs = []
    i = 0
    n = len(rms)
    min_len_samples = int(DTW_MIN_DUR_MS / 1000 * SR)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            start = i * hop
            end = min(len(y), j * hop)
            if (end - start) >= min_len_samples:
                segs.append((start, end))
            i = j
        else:
            i += 1
    # merge by min gap
    merged = []
    min_gap = int(DTW_MIN_GAP_MS / 1000 * SR)
    for s,e in segs:
        if not merged:
            merged.append([s,e])
        else:
            ps,pe = merged[-1]
            if s - pe < min_gap:
                merged[-1][1] = e
            else:
                merged.append([s,e])
    out = [(s,e) for s,e in merged]
    log.info("energy_segments: raw=%d merged=%d min_dur_ms=%d min_gap_ms=%d",
             len(segs), len(out), DTW_MIN_DUR_MS, DTW_MIN_GAP_MS)
    return out

def mfcc_feat(y: np.ndarray) -> np.ndarray:
    m = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=20)
    d = librosa.feature.delta(m)
    return np.vstack([m, d])

def dtw_cost(a: np.ndarray, b: np.ndarray) -> float:
    # косинусный cost → DTW → нормированный финальный cost (меньше — лучше)
    D, wp = librosa.sequence.dtw(X=a, Y=b, metric="cosine", subseq=False)
    cost = float(D[-1, -1])
    norm = cost / (a.shape[1] + b.shape[1])
    return norm

def load_templates(zikr_id: str) -> List[Tuple[str, np.ndarray, float]]:
    base = os.path.join(TEMPLATES_ROOT, zikr_id)
    files = []
    for ext in ("*.wav", "*.mp3", "*.m4a", "*.flac"):
        files.extend(glob.glob(os.path.join(base, ext)))
    outs = []
    names = []
    for p in files:
        try:
            y = load_audio_path_to_mono16k(p)
            if y.size > 1000:
                F = mfcc_feat(y)
                dur_sec = len(y) / SR
                outs.append((os.path.basename(p), F, dur_sec))
                names.append(os.path.basename(p))
        except Exception:
            continue
    log.info("templates usable: %d (%s)", len(outs), names)
    return outs

# ── endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"

@app.post("/dtw_count")
async def dtw_count(file: UploadFile = File(...), zikr_id: str = Form(...)):
    try:
        data = await file.read()
        size = len(data) if data else 0
        log.info("dtw_count: zikr_id=%s file_size=%d bytes", zikr_id, size)

        if not data or size < 512:
            log.warning("dtw_count: empty-file")
            return JSONResponse({"ok": False, "reason": "empty-file"})

        templates = load_templates(zikr_id)
        if not templates:
            log.warning("dtw_count: no-templates for %s", zikr_id)
            return JSONResponse({"ok": False, "reason": "no-templates"})

        tpl_durs = [d for (_, __, d) in templates]
        med_tpl_dur = float(np.median(tpl_durs)) if tpl_durs else 1.0

        # pass1 окно
        min_seg_sec = med_tpl_dur * DUR_FACTOR_LO
        max_seg_sec = med_tpl_dur * DUR_FACTOR_HI

        # абсолютные люфты к окну
        min_seg_sec_eff = max(0.0, min_seg_sec - DUR_ABS_LO_MS/1000.0)
        max_seg_sec_eff = max_seg_sec + DUR_ABS_HI_MS/1000.0

        # pass2 окно (если нужно расслабить)
        rlo = min(RELAX_FACTOR_LO * med_tpl_dur, min_seg_sec_eff)
        rhi = max(RELAX_FACTOR_HI * med_tpl_dur, max_seg_sec_eff)

        # аудио → сегменты
        y = load_audio_bytes_to_mono16k(data)
        segs = energy_segments(y)
        log.info("signal: len=%.3fs, segments=%d, threshold=%.3f",
                 len(y)/SR, len(segs), DTW_THRESHOLD)

        matches = []

        def process_segments(min_s, max_s, pass_name):
            local = []
            for idx, (s, e) in enumerate(segs):
                seg = y[s:e]
                seg_sec = (e - s) / SR
                dur_ms = int(seg_sec * 1000)

                if not (min_s <= seg_sec <= max_s):
                    log.info("%s seg[%d] skipped by dur: dur_ms=%d (allowed %.0f..%.0f)",
                             pass_name, idx, dur_ms, min_s*1000, max_s*1000)
                    continue

                Fseg = mfcc_feat(seg)

                per_tpl = []
                for name, Ft, tpl_sec in templates:
                    try:
                        c = dtw_cost(Fseg, Ft)
                        per_tpl.append((name, float(c), tpl_sec))
                    except Exception as ex:
                        log.warning("DTW error tpl=%s: %s", name, ex)
                        continue

                if not per_tpl:
                    continue

                per_tpl.sort(key=lambda x: x[1])  # by cost asc
                best_name, best, _ = per_tpl[0]
                second = per_tpl[1][1] if len(per_tpl) >= 2 else (best + 1.0)
                votes = sum(1 for _, c, __ in per_tpl if c < DTW_THRESHOLD)

                margin = second - best
                margin_ok = margin >= max(MARGIN_FLOOR, DTW_TOP2_MARGIN)

                near_med = abs(seg_sec - med_tpl_dur) <= (NEAR_MED_EPS * med_tpl_dur)

                # базовые условия
                base_ok = (best < DTW_THRESHOLD) and (votes >= DTW_MIN_TPL_VOTES)

                # смягчение, если best очень хороший, а отрыв маленький
                relax_ok = (best < DTW_THRESHOLD * BEST_RELAX_RATIO) and (margin >= MARGIN_FLOOR)

                # ещё одно смягчение: очень близка длительность к медиане шаблонов
                near_dur_ok = near_med and (best < DTW_THRESHOLD) and (votes >= 1) and (margin >= MARGIN_FLOOR)

                accept = base_ok and (margin_ok or relax_ok or near_dur_ok)

                top_list = [(n, c) for (n, c, __) in per_tpl[:5]]
                log.info(
                    "%s seg[%d]: start_ms=%d dur_ms=%d best=%.4f second=%.4f votes=%d margin=%.4f "
                    "base_ok=%s relax_ok=%s near_dur_ok=%s tpl=%s top=%s",
                    pass_name, idx, int(s*1000/SR), dur_ms, best, second, votes, margin,
                    base_ok, relax_ok, near_dur_ok, best_name, top_list
                )

                if accept:
                    local.append({
                        "start": s/SR, "end": e/SR, "dur": seg_sec,
                        "score": float(best), "tpl": best_name,
                        "votes": int(votes), "second": float(second),
                        "margin": float(margin),
                    })
            return local

        # pass 1 — строгие ворота
        first = process_segments(min_seg_sec_eff, max_seg_sec_eff, "P1")
        if first:
            matches.extend(first)
        else:
            # pass 2 — если ничего не прошло, расслабляем окно
            log.info("relaxing duration gate: %.0f..%.0f ms → %.0f..%.0f ms",
                     min_seg_sec_eff*1000, max_seg_sec_eff*1000, rlo*1000, rhi*1000)
            second = process_segments(rlo, rhi, "P2")
            matches.extend(second)

        used = sorted({m["tpl"] for m in matches})
        log.info("dtw_count: matches=%d used_templates=%s", len(matches), used)

        return JSONResponse({
            "ok": True,
            "count": len(matches),
            "intervals": matches,
            "usedTemplates": used,
            "threshold": DTW_THRESHOLD,
        })
    except Exception as e:
        log.exception("dtw_count: exception")
        return JSONResponse({"ok": False, "reason": str(e)})
