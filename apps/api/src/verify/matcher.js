"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchScore = matchScore;
const normalize_1 = require("./normalize");
const similarity_1 = require("./similarity");
function matchScore({ asrText, userLevel, variants }) {
    const tLat = (0, normalize_1.normalizeLatin)(asrText);
    const tRu = (0, normalize_1.normalizeRu)(asrText);
    const tAr = (0, normalize_1.normalizeAr)(asrText);
    let best = 0;
    let bestAnchors = 0;
    for (const v of variants) {
        const text = v.textNorm;
        let sim = 0, anchorHits = 0;
        if (v.script === "LATIN") {
            sim = (0, similarity_1.simRatio)(tLat, text);
            anchorHits = (0, normalize_1.hasAnchors)(tLat, v.anchors);
        }
        else if (v.script === "RU") {
            sim = (0, similarity_1.simRatio)(tRu, text);
            anchorHits = (0, normalize_1.hasAnchors)(tRu, v.anchors);
        }
        else if (v.script === "AR") {
            sim = (0, similarity_1.simRatio)(tAr, text);
            anchorHits = (0, normalize_1.hasAnchors)(tAr, v.anchors);
        }
        const anchorsScore = Math.min(1, anchorHits / Math.max(1, v.anchors.length));
        const score = 0.65 * sim + 0.35 * anchorsScore + (v.priority ? 0.01 * v.priority : 0);
        if (score > best) {
            best = score;
            bestAnchors = anchorHits;
        }
    }
    const threshold = userLevel === "BEGINNER" ? 0.62 : 0.78;
    const ok = best >= threshold;
    return { ok, score: best, threshold, anchorsHit: bestAnchors };
}
//# sourceMappingURL=matcher.js.map