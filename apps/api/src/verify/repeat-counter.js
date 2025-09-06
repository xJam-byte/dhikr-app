"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countRepeats = countRepeats;
const text_utils_1 = require("/Users/murat/OneDrive/\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B/dhikr_app/apps/api/src/verify/text-utils");
const text_utils_2 = require("/Users/murat/OneDrive/\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B/dhikr_app/apps/api/src/verify/text-utils");
function mergeRanges(ranges) {
    if (ranges.length <= 1)
        return ranges;
    ranges.sort((a, b) => a.start - b.start);
    const out = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
        const prev = out[out.length - 1];
        const cur = ranges[i];
        if (cur.start <= prev.end) {
            prev.end = Math.max(prev.end, cur.end);
        }
        else {
            out.push(cur);
        }
    }
    return out;
}
function anchorsHitIn(text, anchors) {
    if (!anchors || anchors.length === 0)
        return 0;
    const t = (0, text_utils_2.normalizeText)(text);
    let hits = 0;
    for (const a of anchors) {
        const needle = (0, text_utils_2.normalizeText)(a);
        if (!needle)
            continue;
        if (t.includes(needle))
            hits++;
    }
    return hits;
}
function countRepeats(asrText, variants) {
    const t = (0, text_utils_2.normalizeText)(asrText);
    const matches = [];
    for (const v of variants) {
        const re = (0, text_utils_1.buildVariantRegex)((0, text_utils_2.normalizeText)(v.textNorm), v.script);
        let m;
        while ((m = re.exec(t))) {
            const full = m[0];
            const end = re.lastIndex;
            const start = end - full.length;
            const anchorsHit = anchorsHitIn(full, v.anchors);
            matches.push({ start, end, anchorsHit });
            if (m.index === re.lastIndex)
                re.lastIndex++;
        }
    }
    if (matches.length === 0) {
        return { totalRepeats: 0, ranges: [] };
    }
    const withAnchors = matches.filter((m) => m.anchorsHit > 0);
    const base = withAnchors.length > 0 ? withAnchors : matches;
    const ranges = mergeRanges(base.map(({ start, end }) => ({ start, end })));
    return { totalRepeats: ranges.length, ranges };
}
//# sourceMappingURL=repeat-counter.js.map