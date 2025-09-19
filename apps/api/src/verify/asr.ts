import * as fs from "node:fs/promises";
import axios from "axios";
import FormData from "form-data";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type AsrWord = {
  w: string; // слово в нормализованном виде (как пришло от ASR; пунктуация убрана)
  start: number; // сек
  end: number; // сек
  p?: number; // confidence [0..1], если есть
};

export type AsrSegment = {
  text: string;
  start: number; // сек
  end: number; // сек
  conf?: number; // средняя уверенность по сегменту, если есть
};

export type AsrResult = {
  text: string; // полный распознанный текст (с пробелами, без тяжёлой пунктуации)
  conf: number; // агрегированная уверенность [0..1]
  lang?: string | null;
  has_ar?: boolean;
  segments_count?: number;
  segments?: AsrSegment[];
  words?: AsrWord[]; // ← добавлено: гарантируем присутствие (хотя бы синтетически)
};

export interface AsrAdapter {
  transcribe(
    filePath: string,
    opts?: { lang?: string; vadMinSilMs?: number }
  ): Promise<AsrResult>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function hasArabicChars(s: string) {
  return /[\u0600-\u06FF]/.test(s || "");
}

/** Простая нормализация для токенизации текста, не заменяет text-utils вашего пайплайна */
function simpleNormalizeForTokens(s: string): string {
  return (s || "")
    .replace(/[.,!?;:()\[\]{}"“”'’]+/g, " ") // убираем пунктуацию
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Безопасно спарсить возможные слова из ответа сервера (любая форма) */
function parseWords(raw: any): AsrWord[] | undefined {
  if (!raw) return undefined;

  // формат #1: [{w, start, end, p}]
  if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
    const out: AsrWord[] = [];
    for (const it of raw) {
      const w = String(it.w ?? it.word ?? "").trim();
      const start = Number(it.start ?? it.begin ?? it.t0);
      const end = Number(it.end ?? it.finish ?? it.t1);
      const p = it.p ?? it.prob ?? it.confidence;
      if (w && Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        out.push({ w, start, end, p: typeof p === "number" ? p : undefined });
      }
    }
    return out.length ? out : undefined;
  }

  // формат #2: массив кортежей [w, start, end, p?]
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    const out: AsrWord[] = [];
    for (const t of raw) {
      const w = String(t[0] ?? "").trim();
      const start = Number(t[1]);
      const end = Number(t[2]);
      const p = Number(t[3]);
      if (w && Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        out.push({ w, start, end, p: Number.isFinite(p) ? p : undefined });
      }
    }
    return out.length ? out : undefined;
  }

  return undefined;
}

/** Аккуратно парсим сегменты из произвольного формата ответа */
function parseSegments(raw: any): AsrSegment[] | undefined {
  if (!raw) return undefined;

  // формат #1: [{text, start, end, conf?}]
  if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
    const out: AsrSegment[] = [];
    for (const it of raw) {
      const text = String(it.text ?? "").trim();
      const start = Number(it.start ?? it.begin ?? it.t0);
      const end = Number(it.end ?? it.finish ?? it.t1);
      const conf = it.conf ?? it.prob ?? it.confidence;
      if (
        text &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end >= start
      ) {
        out.push({
          text,
          start,
          end,
          conf: typeof conf === "number" ? conf : undefined,
        });
      }
    }
    return out.length ? out : undefined;
  }

  return undefined;
}

/**
 * Если сервер не вернул words, но вернул сегменты с таймкодами,
 * создаём слова равномерно по длительности сегмента.
 */
function synthesizeWordsFromSegments(
  segments: AsrSegment[]
): AsrWord[] | undefined {
  if (!segments?.length) return undefined;

  const words: AsrWord[] = [];
  for (const seg of segments) {
    const tokens = simpleNormalizeForTokens(seg.text)
      .split(" ")
      .filter(Boolean);
    const n = tokens.length;
    if (!n) continue;
    const dur = Math.max(0, seg.end - seg.start);
    if (!Number.isFinite(dur) || dur <= 0) {
      // если длительность неадекватна, просто накидываем без таймингов (0..0)
      for (const tk of tokens) words.push({ w: tk, start: 0, end: 0 });
      continue;
    }
    const step = dur / n;
    for (let i = 0; i < n; i++) {
      const w = tokens[i];
      const start = seg.start + step * i;
      const end = i === n - 1 ? seg.end : seg.start + step * (i + 1);
      words.push({ w, start, end });
    }
  }

  return words.length ? words : undefined;
}

/** Упорядочим и чуть почистим слова */
function normalizeWords(words: AsrWord[] | undefined): AsrWord[] | undefined {
  if (!words?.length) return undefined;
  const w = words
    .filter(
      (x) => x && x.w && Number.isFinite(x.start) && Number.isFinite(x.end)
    )
    .map((x) => ({ ...x, w: simpleNormalizeForTokens(x.w) }))
    .filter((x) => x.w.length > 0 && x.end >= x.start)
    .sort((a, b) => a.start - b.start);
  return w.length ? w : undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapters
// ──────────────────────────────────────────────────────────────────────────────

export class HttpAsr implements AsrAdapter {
  constructor(private url: string) {}

  async transcribe(
    filePath: string,
    opts?: { lang?: string; vadMinSilMs?: number }
  ): Promise<AsrResult> {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", buf, {
      filename: "audio.m4a",
      contentType: "audio/m4a",
    });

    // Подсказки серверу
    form.append("lang", opts?.lang ?? "auto");
    if (typeof opts?.vadMinSilMs === "number") {
      form.append("vad_min_sil_ms", String(opts.vadMinSilMs));
    }
    // Просим вернуть максимальную структуру (сервер может игнорировать поля)
    form.append("return_words", "1");
    form.append("return_segments", "1");
    form.append("return_conf", "1");

    const res = await axios.post(this.url, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
    });

    const d = res.data || {};

    // Базовые поля
    const text: string = (d.text || "").toString();
    const conf: number = Number(d.conf || d.confidence || 0);
    const lang = d.lang ?? null;
    const has_ar: boolean =
      typeof d.has_ar === "boolean" ? d.has_ar : hasArabicChars(text);

    // Расширенные поля
    const segments = parseSegments(d.segments);
    let words = parseWords(d.words);

    // Если нет words — попробуем синтезировать из сегментов
    if (!words && segments) {
      words = synthesizeWordsFromSegments(segments);
    }

    const wordsNorm = normalizeWords(words);
    const segmentsCount =
      typeof d.segments_count === "number"
        ? d.segments_count
        : Array.isArray(segments)
        ? segments.length
        : undefined;

    return {
      text: text.trim(),
      conf: Number.isFinite(conf) ? conf : 0,
      lang,
      has_ar,
      segments_count: segmentsCount,
      segments: segments,
      words: wordsNorm,
    };
  }
}

export class MockAsr implements AsrAdapter {
  async transcribe(): Promise<AsrResult> {
    return {
      text: "",
      conf: 0.0,
      lang: null,
      has_ar: false,
      segments_count: 0,
      segments: [],
      words: [], // ← даже мок теперь возвращает пустой массив words
    };
  }
}

export function createAsr(): AsrAdapter {
  const provider = process.env.ASR_PROVIDER || "mock";
  if (provider === "http") {
    const url = process.env.ASR_HTTP_URL || "http://127.0.0.1:5005/transcribe";
    return new HttpAsr(url);
  }
  return new MockAsr();
}
