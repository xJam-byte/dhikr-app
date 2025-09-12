// ──────────────────────────────────────────────────────────────────────────────
// Нормализация и утилиты для AR / LAT / RU
// ──────────────────────────────────────────────────────────────────────────────

export type VariantScript = "AR" | "LATIN" | "RU";

// Диакритика арабского (танвин/огласовки) и татвил
export const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670]/g;
export const AR_TATWEEL = /\u0640/g;

// Блок «арабские символы» (буквы/цифры/знаки), используем как основу для границ
export const AR_BLOCK = /[\u0600-\u06FF]/;

// ── Базовые нормализации ─────────────────────────────────────────────────────

/** Нормализация арабского текста: убираем татвил и диакритику, оставляем буквы и пробелы. */
export function normalizeArabic(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFKC")
    .replace(AR_TATWEEL, "")
    .replace(AR_DIACRITICS, "")
    .replace(/[^\u0600-\u06FF\s]+/g, " ") // оставляем арабские буквы и пробел
    .replace(/\s+/g, " ")
    .trim();
}

/** Нормализация латиницы/русского: lowercase, NFKD, удаление комб.диакритик \p{M}, схлопывание пробелов. */
export function normalizeLatinRu(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // убрать акценты/диакритики (́ ̄ ̈ и т.п.)
    .replace(/[’'`´]+/g, "") // апострофы → убрать (часто мешают)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ") // оставляем только буквы/цифры/пробел
    .replace(/\s+/g, " ")
    .trim();
}

/** Определение, содержит ли строка арабские символы. */
export function hasArabic(s: string): boolean {
  return AR_BLOCK.test(s || "");
}

/** Нормализация одного токена согласно его скрипту. */
export function normalizeToken(s: string): string {
  return hasArabic(s) ? normalizeArabic(s) : normalizeLatinRu(s);
}

/** Разбивка на слова после соответствующей нормализации. */
export function toPhraseWords(text: string, script: VariantScript): string[] {
  const norm = script === "AR" ? normalizeArabic(text) : normalizeLatinRu(text);
  return norm.split(/\s+/).filter(Boolean);
}

// ── Regex утилиты ─────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Строим регексп под конкретный вариант.
 * LAT/RU: используем «мягкие» границы не через \b, а через \P{L}\P{N}
 * AR: границы как (^|[^AR]) ... ([^AR]|$)
 * Между словами допускаем \s* чтобы ловить и слитное написание.
 */
export function buildVariantRegex(
  textNorm: string,
  script: VariantScript
): RegExp {
  const words = textNorm.split(/\s+/).map(escapeRegex).filter(Boolean);
  if (words.length === 0) return /$a/; // пустой нерелевантный паттерн

  if (script === "AR") {
    const AR_NOT = "[^\\u0600-\\u06FF]";
    const middle = words.join("\\s*");
    const pattern = `(^|${AR_NOT})${middle}(${AR_NOT}|$)`;
    return new RegExp(pattern, "gi");
  }

  // LAT/RU — «границы» как не-буквенно-цифровые символы (или начало/конец)
  const NOT_WORD = "[^\\p{L}\\p{N}]";
  const middle = words.join("\\s*");
  const pattern = `(^|${NOT_WORD})${middle}(${NOT_WORD}|$)`;
  return new RegExp(pattern, "giu");
}

// ── Обратная совместимость: мягкая нормализация всей строки ───────────────────

/**
 * Универсальная «мягкая» нормализация (для старых мест вызова).
 * Сохраняем поведение: нижний регистр, чистка диакритики арабского, пунктуация -> пробел.
 */
export function normalizeText(s: string): string {
  if (!s) return "";
  let t = s.toLowerCase();

  // Удаляем арабскую диакритику и татвил
  const arDiacritics = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u0640]/g;
  t = t.replace(arDiacritics, "");

  // Удаляем диакритику в латинице/кириллице (на всякий)
  t = t.normalize("NFKD").replace(/\p{M}+/gu, "");

  // Меняем нестабильные переносы/пунктуацию на пробел
  t = t.replace(/[’'`´]/g, ""); // апострофы устраняем
  t = t.replace(/[_.,;:!?،؛—\-]+/g, " ");

  // Сжимаем пробелы
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
