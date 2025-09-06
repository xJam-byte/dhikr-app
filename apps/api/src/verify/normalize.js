"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simplify = simplify;
exports.normalizeLatin = normalizeLatin;
exports.normalizeRu = normalizeRu;
exports.normalizeAr = normalizeAr;
exports.hasAnchors = hasAnchors;
function simplify(s) {
    return ((s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zа-яёіїґұқңһөәçğşıñ0-9\u0600-\u06FF'’\-\s]/g, "")
        .replace(/\s+/g, " ")
        .trim());
}
function normalizeLatin(s) {
    let t = simplify(s);
    t = t
        .replace(/ḥ/g, "h")
        .replace(/ā/g, "a")
        .replace(/ī/g, "i")
        .replace(/ū/g, "u");
    t = t.replace(/llāh|llah/g, "llah");
    return t;
}
function normalizeRu(s) {
    let t = simplify(s);
    t = t.replace(/й/g, "и").replace(/ё/g, "е").replace(/ъ|ь/g, "");
    t = t
        .replace(/къ|кь|қ/g, "к")
        .replace(/ғ/g, "г")
        .replace(/һ|h/g, "х");
    t = t.replace(/аллаху|аллах/g, "ллах");
    return t;
}
function normalizeAr(s) {
    let t = (s || "").toLowerCase();
    t = t.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
    t = t.replace(/[\u0671\u0672\u0673\u0675\u0622\u0623\u0625]/g, "\u0627");
    t = t.replace(/\u0629/g, "\u0647");
    t = t.replace(/\u0649/g, "\u064A");
    t = t.replace(/\s+/g, " ").trim();
    return t;
}
function hasAnchors(text, anchors) {
    const t = simplify(text);
    let hit = 0;
    for (const a of anchors || []) {
        if (!a)
            continue;
        if (t.includes(a))
            hit++;
    }
    return hit;
}
//# sourceMappingURL=normalize.js.map