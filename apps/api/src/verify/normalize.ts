export function simplify(s: string) {
  return (
    (s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      // ⚠️ оставляем латиницу, кириллицу и арабский диапазон \u0600-\u06FF
      .replace(/[^a-zа-яёіїґұқңһөәçğşıñ0-9\u0600-\u06FF'’\-\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function normalizeLatin(s: string) {
  let t = simplify(s);
  t = t
    .replace(/ḥ/g, "h")
    .replace(/ā/g, "a")
    .replace(/ī/g, "i")
    .replace(/ū/g, "u");
  t = t.replace(/llāh|llah/g, "llah");
  return t;
}

export function normalizeRu(s: string) {
  let t = simplify(s);
  t = t.replace(/й/g, "и").replace(/ё/g, "е").replace(/ъ|ь/g, "");
  t = t
    .replace(/къ|кь|қ/g, "к")
    .replace(/ғ/g, "г")
    .replace(/һ|h/g, "х");
  t = t.replace(/аллаху|аллах/g, "ллах");
  return t;
}

// 🔥 НОВОЕ: арабская графика — удаляем огласовки, упростим алиф/тамарбута и пр.
export function normalizeAr(s: string) {
  let t = (s || "").toLowerCase();
  // убрать огласовки
  t = t.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  // разные алифы к обычному алифу
  t = t.replace(/[\u0671\u0672\u0673\u0675\u0622\u0623\u0625]/g, "\u0627"); // ء-варианты алифа → ا
  // та марбута → ха
  t = t.replace(/\u0629/g, "\u0647"); // ة → ه
  // алиф максура → я
  t = t.replace(/\u0649/g, "\u064A"); // ى → ي
  // лишние пробелы
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// Якоря: текст может быть латиница/кириллица/арабский — просто contains() по нормализованному каналу
export function hasAnchors(text: string, anchors: string[]) {
  const t = simplify(text);
  let hit = 0;
  for (const a of anchors || []) {
    if (!a) continue;
    if (t.includes(a)) hit++;
  }
  return hit;
}
