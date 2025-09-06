// Утилиты нормализации под AR/LAT/RU и построения гибких регулярок

export function normalizeText(s: string) {
  if (!s) return "";
  let t = s.toLowerCase();

  // Удаляем арабскую диакритику и татвил
  const arDiacritics = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u0640]/g; // включая tatweel \u0640
  t = t.replace(arDiacritics, "");

  // Меняем нестабильные переносы/пунктуацию на пробел
  t = t.replace(/[_.,;:!?،؛—\-]+/g, " ");

  // Сжимаем пробелы
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export type VariantScript = "AR" | "LATIN" | "RU";

// Позволяем гибкие пробелы между словами; экранируем спецсимволы
function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

// Строим регексп под конкретный вариант.
// Пример: "subhan allah" -> /\bsubhan\s*allah\b/gi
export function buildVariantRegex(
  textNorm: string,
  script: VariantScript
): RegExp {
  const words = textNorm.split(/\s+/).map(escapeRegex).filter(Boolean);
  if (words.length === 0) return /$a/; // пустой

  // Границы слова: для арабского \b не всегда работает, используем "(^|[^ء-ي])" как левую границу и "([^ء-ي]|$)" как правую
  if (script === "AR") {
    const pattern = `(^|[^ء-ي])${words.join("\\s*")}([^ء-ي]|$)`;
    return new RegExp(pattern, "gi");
  }

  // LAT/RU — подойдёт \b и \s*
  const pattern = `\\b${words.join("\\s*")}\\b`;
  return new RegExp(pattern, "gi");
}
