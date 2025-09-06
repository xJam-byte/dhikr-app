"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.buildVariantRegex = buildVariantRegex;
function normalizeText(s) {
    if (!s)
        return "";
    let t = s.toLowerCase();
    const arDiacritics = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u0640]/g;
    t = t.replace(arDiacritics, "");
    t = t.replace(/[_.,;:!?،؛—\-]+/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
}
function escapeRegex(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
function buildVariantRegex(textNorm, script) {
    const words = textNorm.split(/\s+/).map(escapeRegex).filter(Boolean);
    if (words.length === 0)
        return /$a/;
    if (script === "AR") {
        const pattern = `(^|[^ء-ي])${words.join("\\s*")}([^ء-ي]|$)`;
        return new RegExp(pattern, "gi");
    }
    const pattern = `\\b${words.join("\\s*")}\\b`;
    return new RegExp(pattern, "gi");
}
//# sourceMappingURL=text-utils.js.map