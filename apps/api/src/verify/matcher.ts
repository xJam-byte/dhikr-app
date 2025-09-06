import {
  normalizeLatin,
  normalizeRu,
  normalizeAr,
  hasAnchors,
} from "./normalize";
import { simRatio } from "./similarity";

export type Variant = {
  script: "LATIN" | "RU" | "AR"; // 👈 добавили AR
  textNorm: string; // уже нормализованный текст под свой канал
  anchors: string[];
  priority: number;
};

export type MatchParams = {
  asrText: string;
  userLevel: "BEGINNER" | "ADVANCED";
  variants: Variant[];
};

export function matchScore({ asrText, userLevel, variants }: MatchParams) {
  const tLat = normalizeLatin(asrText);
  const tRu = normalizeRu(asrText);
  const tAr = normalizeAr(asrText); // 👈

  let best = 0;
  let bestAnchors = 0;

  for (const v of variants) {
    const text = v.textNorm;
    let sim = 0,
      anchorHits = 0;

    if (v.script === "LATIN") {
      sim = simRatio(tLat, text);
      anchorHits = hasAnchors(tLat, v.anchors);
    } else if (v.script === "RU") {
      sim = simRatio(tRu, text);
      anchorHits = hasAnchors(tRu, v.anchors);
    } else if (v.script === "AR") {
      sim = simRatio(tAr, text);
      anchorHits = hasAnchors(tAr, v.anchors);
    }

    const anchorsScore = Math.min(
      1,
      anchorHits / Math.max(1, v.anchors.length)
    );
    const score =
      0.65 * sim + 0.35 * anchorsScore + (v.priority ? 0.01 * v.priority : 0);

    if (score > best) {
      best = score;
      bestAnchors = anchorHits;
    }
  }

  const threshold = userLevel === "BEGINNER" ? 0.62 : 0.78;
  const ok = best >= threshold;
  return { ok, score: best, threshold, anchorsHit: bestAnchors };
}
