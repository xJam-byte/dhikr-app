import { normalizeArabic, normalizeLatinRu, toPhraseWords } from "./text-utils";

// ──────────────────────────────────────────────────────────────────────────────
// Типы
// ──────────────────────────────────────────────────────────────────────────────

export type AsrWord = {
  w: string; // слово (как распозналось, уже нормализуем ниже)
  start: number; // сек
  end: number; // сек
  p?: number; // вероятность слова (0..1)
};

export type RepeatInterval = { start: number; end: number; prob: number };

export type Script = "AR" | "LATIN_RU";

// ──────────────────────────────────────────────────────────────────────────────
// Параметры (ENV) + флаги
// ──────────────────────────────────────────────────────────────────────────────

const envNum = (key: string, def: number) =>
  Number.isFinite(Number(process.env[key])) ? Number(process.env[key]) : def;

const ADAPTIVE_ENABLED = process.env.REPEAT_ADAPTIVE_ENABLED === "1";

export const MIN_REPEAT_DURATION_MS = envNum("MIN_REPEAT_DURATION_MS", 700);
export const MIN_GAP_BETWEEN_REPEATS_MS = envNum(
  "MIN_GAP_BETWEEN_REPEATS_MS",
  250
);
export const MAX_WORD_SKIP = envNum("MAX_WORD_SKIP", 1);
export const MIN_AVG_WORD_PROB = Number(process.env.MIN_AVG_WORD_PROB ?? 0.35);

// новое независимое «окно невосприимчивости» (после зачёта повтора)
export const REFRACTORY_WINDOW_MS = envNum("REFRACTORY_WINDOW_MS", 300);

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
/** Вспомогательные адаптивные эвристики */
// ──────────────────────────────────────────────────────────────────────────────

// медианная длительность слова по всему списку (мс)
function medianWordMs(words: AsrWord[]): number | undefined {
  if (!words?.length) return undefined;
  const arr = words
    .map((w) => Math.max(0, (w.end - w.start) * 1000))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!arr.length) return undefined;
  const m = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
}

// адаптивное мин. время повтора по длине фразы (в словах)
function minRepeatByWords(wordsCount: number): number {
  if (wordsCount <= 3) return 520; // 480–560ms зона
  if (wordsCount <= 7) return 740; // 650–820ms зона
  return 1000; // 900–1200ms зона
}

// адаптивный minGap по темпу речи
function minGapByTempo(medianMs?: number): number {
  const base = 220;
  if (!medianMs || !Number.isFinite(medianMs)) return base;
  return Math.max(base, Math.round(0.25 * medianMs));
}

// адаптивное число "мусорных" слов внутри фразы
function allowedSkips(script: Script, phraseLen: number): number {
  if (!ADAPTIVE_ENABLED) return MAX_WORD_SKIP;
  if (script === "AR") return phraseLen >= 6 ? 2 : 1;
  // LATIN/RU — обычно аккуратнее распознаётся
  return phraseLen >= 8 ? 2 : 1;
}

// ──────────────────────────────────────────────────────────────────────────────
// Подсчёт повторов по словам (FSM) — улучшенная версия с адаптацией
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Считает повторы фразы в потоке слов.
 * - Без перекрытий
 * - Допускает до MAX_WORD_SKIP/адаптивно «мусорных» токенов внутри
 * - Требует MIN_REPEAT_DURATION_MS (или адаптивный) и MIN_AVG_WORD_PROB
 * - Независимое REFRACTORY_WINDOW_MS защищает от «слипания»
 */
export function countRepeatsFromWords(
  wordsRaw: AsrWord[],
  phraseWords: string[],
  // необязательные хинты: скрипт и предрасчитанная медиана длительности слова
  opts?: { scriptHint?: Script; medianWordMsHint?: number }
): RepeatInterval[] {
  const words = wordsRaw;
  const result: RepeatInterval[] = [];
  if (!words.length || !phraseWords.length) return result;

  const phraseLen = phraseWords.length;
  const medMs =
    opts?.medianWordMsHint ??
    // медиана по всему списку слов — быстро и достаточно стабильно
    medianWordMs(words);

  const minRepeatMs = ADAPTIVE_ENABLED
    ? minRepeatByWords(phraseLen)
    : MIN_REPEAT_DURATION_MS;

  const minGapMs = ADAPTIVE_ENABLED
    ? minGapByTempo(medMs)
    : MIN_GAP_BETWEEN_REPEATS_MS;

  const refractoryMs = REFRACTORY_WINDOW_MS;

  const skipLimit = allowedSkips(opts?.scriptHint ?? "LATIN_RU", phraseLen);

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
        if (skipped > skipLimit) break;
        j++;
      }
    }

    const matched = k === phraseWords.length;
    const durMs = matched ? Math.max(0, (wEnd - wStart) * 1000) : 0;
    const avgProb = probs.length
      ? probs.reduce((a, b) => a + b, 0) / probs.length
      : 0;

    if (matched && durMs >= minRepeatMs && avgProb >= MIN_AVG_WORD_PROB) {
      // проверка зазора с предыдущим — ДВА условия:
      // 1) независимое «окно невосприимчивости» (refractory)
      // 2) минимальный разрыв между повторами (minGap)
      const prev = result.at(-1);
      const sincePrevStartMs = prev
        ? wStart * 1000 - prev.end * 1000
        : Number.POSITIVE_INFINITY;

      if (sincePrevStartMs >= refractoryMs && sincePrevStartMs >= minGapMs) {
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
  // передаём хинт скрипта, чтобы адаптивно выбрать skipLimit
  return countRepeatsFromWords(normWords, phrase, { scriptHint: script });
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
