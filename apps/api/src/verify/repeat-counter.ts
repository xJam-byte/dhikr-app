import {
  normalizeArabic,
  normalizeLatinRu,
  hasArabic,
  toPhraseWords,
} from "./text-utils";

// ──────────────────────────────────────────────────────────────────────────────
// Типы
// ──────────────────────────────────────────────────────────────────────────────

export type AsrWord = {
  w: string; // слово (как распозналось)
  start: number; // сек
  end: number; // сек
  p?: number; // вероятность слова (0..1)
};

export type RepeatInterval = { start: number; end: number; prob: number };

export type Script = "AR" | "LATIN_RU";

// ──────────────────────────────────────────────────────────────────────────────
// Параметры устойчивости (через ENV)
// ──────────────────────────────────────────────────────────────────────────────

const envNum = (key: string, def: number) =>
  Number.isFinite(Number(process.env[key])) ? Number(process.env[key]) : def;

export const MIN_REPEAT_DURATION_MS = envNum("MIN_REPEAT_DURATION_MS", 700);
export const MIN_GAP_BETWEEN_REPEATS_MS = envNum(
  "MIN_GAP_BETWEEN_REPEATS_MS",
  250
);
export const MAX_WORD_SKIP = envNum("MAX_WORD_SKIP", 1);
export const MIN_AVG_WORD_PROB = Number(process.env.MIN_AVG_WORD_PROB ?? 0.35);

// ──────────────────────────────────────────────────────────────────────────────
// Нормализация токенов
// ──────────────────────────────────────────────────────────────────────────────

function normalizeWords(words: AsrWord[], script: Script): AsrWord[] {
  if (script === "AR") {
    return words
      .map((w) => ({ ...w, w: normalizeArabic(w.w) }))
      .filter((w) => !!w.w);
  }
  return words
    .map((w) => ({ ...w, w: normalizeLatinRu(w.w) }))
    .filter((w) => !!w.w);
}

function toPhrase(text: string, script: Script): string[] {
  return script === "AR"
    ? toPhraseWords(text, "AR")
    : toPhraseWords(text, "LATIN");
}

// ──────────────────────────────────────────────────────────────────────────────
// Подсчёт повторов по словам (FSM)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Считает повторы фразы в потоке слов.
 * - Без перекрытий
 * - Допускает до MAX_WORD_SKIP «мусорных» токенов внутри
 * - Требует MIN_REPEAT_DURATION_MS и MIN_AVG_WORD_PROB
 */
export function countRepeatsFromWords(
  wordsRaw: AsrWord[],
  phraseWords: string[]
): RepeatInterval[] {
  const words = wordsRaw;
  const result: RepeatInterval[] = [];
  if (!words.length || !phraseWords.length) return result;

  let i = 0;
  while (i < words.length) {
    let j = i;
    let k = 0;
    let skipped = 0;
    let wStart = -1;
    let wEnd = -1;
    const probs: number[] = [];

    while (j < words.length && k < phraseWords.length) {
      const cur = words[j];
      if (!cur.w) {
        j++;
        continue;
      }
      const ok = cur.w === phraseWords[k];

      if (ok) {
        if (wStart < 0) wStart = cur.start;
        wEnd = cur.end;
        probs.push(Number(cur.p ?? 0));
        j++;
        k++;
      } else {
        // допускаем немного «мусора» между словами фразы
        skipped++;
        if (skipped > MAX_WORD_SKIP) break;
        j++;
      }
    }

    const matched = k === phraseWords.length;
    const durMs = matched ? Math.max(0, (wEnd - wStart) * 1000) : 0;
    const avgProb = probs.length
      ? probs.reduce((a, b) => a + b, 0) / probs.length
      : 0;

    if (
      matched &&
      durMs >= MIN_REPEAT_DURATION_MS &&
      avgProb >= MIN_AVG_WORD_PROB
    ) {
      // проверка зазора с предыдущим
      const prev = result.at(-1);
      const gapMs = prev
        ? wStart * 1000 - prev.end * 1000
        : Number.POSITIVE_INFINITY;
      if (gapMs >= MIN_GAP_BETWEEN_REPEATS_MS) {
        result.push({ start: wStart, end: wEnd, prob: avgProb });
        i = j; // прыгаем к концу матча, исключая overlap
        continue;
      }
    }

    i++; // не удалось — двигаемся дальше
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Слияние интервалов и вспомогательные
// ──────────────────────────────────────────────────────────────────────────────

export function mergeIntervals(intervals: RepeatInterval[]): RepeatInterval[] {
  if (intervals.length <= 1) return intervals.slice();
  const items = intervals.slice().sort((a, b) => a.start - b.start);
  const out: RepeatInterval[] = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const prev = out[out.length - 1];
    const cur = items[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
      prev.prob = Math.max(prev.prob, cur.prob);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Верхняя граница повторов по длительности файла (anti-overcount). */
export function capByDuration(
  repeats: RepeatInterval[],
  durationSec: number,
  phraseWordCount: number
): RepeatInterval[] {
  const minPhraseSec = Math.max(phraseWordCount * 0.25, 0.4);
  const maxByTime = Math.floor((durationSec / minPhraseSec) * 1.2); // +20% запас
  if (!Number.isFinite(maxByTime) || maxByTime <= 0) return repeats;
  return repeats.slice(0, Math.max(1, maxByTime));
}

// ──────────────────────────────────────────────────────────────────────────────
// Высокоуровневые хелперы
// ──────────────────────────────────────────────────────────────────────────────

export function countRepeatsFromWordsForScript(
  words: AsrWord[],
  phraseText: string,
  script: Script
): RepeatInterval[] {
  const normWords = normalizeWords(words, script);
  const phrase = toPhrase(phraseText, script);
  return countRepeatsFromWords(normWords, phrase);
}

/** Агрегатор по двум скриптам + ограничение по длительности. */
export function countRepeatsUnified(
  words: AsrWord[],
  phraseArabic: string | undefined,
  phraseLatinRu: string | undefined,
  durationSec?: number
): RepeatInterval[] {
  const ar = phraseArabic
    ? countRepeatsFromWordsForScript(words, phraseArabic, "AR")
    : [];
  const lat = phraseLatinRu
    ? countRepeatsFromWordsForScript(words, phraseLatinRu, "LATIN_RU")
    : [];
  let merged = mergeIntervals([...ar, ...lat]);

  const wordCount = Math.max(
    phraseArabic ? toPhrase(phraseArabic, "AR").length : 0,
    phraseLatinRu ? toPhrase(phraseLatinRu, "LATIN_RU").length : 0
  );
  if (durationSec && wordCount > 0) {
    merged = capByDuration(merged, durationSec, wordCount);
  }
  return merged;
}
