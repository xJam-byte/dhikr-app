import { buildVariantRegex } from "./text-utils";
import { normalizeText } from "./text-utils";

type Variant = {
  script: "AR" | "LATIN" | "RU";
  textNorm: string;
  anchors?: string[]; // якорные слова для валидации
};

// Объединяем пересекающиеся матчи, чтобы не считать одно и то же 2 раза
function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  if (ranges.length <= 1) return ranges;
  ranges.sort((a, b) => a.start - b.start);
  const out = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = out[out.length - 1];
    const cur = ranges[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      out.push(cur);
    }
  }
  return out;
}

// Подсчёт якорей внутри фрагмента
function anchorsHitIn(text: string, anchors: string[] | undefined) {
  if (!anchors || anchors.length === 0) return 0;
  const t = normalizeText(text);
  let hits = 0;
  for (const a of anchors) {
    const needle = normalizeText(a);
    if (!needle) continue;
    if (t.includes(needle)) hits++;
  }
  return hits;
}

export function countRepeats(asrText: string, variants: Variant[]) {
  const t = normalizeText(asrText);

  const matches: Array<{ start: number; end: number; anchorsHit: number }> = [];

  for (const v of variants) {
    const re = buildVariantRegex(normalizeText(v.textNorm), v.script);
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      // Индекс 0 — вся строка, группы для AR имеют обрамляющие символьные классы.
      // Берём диапазон совпадения по индексу re.lastIndex и длине m[0]
      const full = m[0];
      const end = re.lastIndex;
      const start = end - full.length;

      const anchorsHit = anchorsHitIn(full, v.anchors);
      matches.push({ start, end, anchorsHit });
      // защита от зацикливания на пустых матчах
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  if (matches.length === 0) {
    return { totalRepeats: 0, ranges: [] as { start: number; end: number }[] };
  }

  // Сначала отфильтруем совсем «безъякорные» матчи, оставим остальные
  const withAnchors = matches.filter((m) => m.anchorsHit > 0);
  const base = withAnchors.length > 0 ? withAnchors : matches; // если якорей нигде, используем всё, но осторожно

  const ranges = mergeRanges(base.map(({ start, end }) => ({ start, end })));
  return { totalRepeats: ranges.length, ranges };
}
