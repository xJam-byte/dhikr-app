// Преобразуем translations (массив/объект) в map { ru: "...", kz: "...", en: "..." }
export function toTransMap(translations) {
  if (!translations) return {};
  if (Array.isArray(translations)) {
    const m = {};
    for (const t of translations) {
      if (t?.lang && typeof t.text === "string") m[t.lang] = t.text;
    }
    return m;
  }
  return translations; // уже объект
}

// Простейшая мапа известных формул на рус. транслит
export function toRuTranslit(zikr) {
  const ar = (zikr?.arabicText || "").replace(/\s+/g, " ").trim();
  const tl = (zikr?.translit || "").toLowerCase();

  if (ar.includes("سُبْحَانَ") || tl.includes("sub") || tl.includes("subḥ"))
    return "Субхана-Ллах";
  if (ar.includes("الْحَمْدُ") || tl.includes("hamd")) return "Альхамдулиллях";
  if (ar.includes("اللَّهُ أَكْبَرُ") || tl.includes("akbar"))
    return "Аллаху Акбар";
  if (tl.startsWith("asbaḥ") || ar.includes("أَصْبَحْنَا"))
    return "Асбахна ва асбаха-ль-мульку лиллях";
  if (tl.startsWith("amsa") || ar.includes("أَمْسَيْنَا"))
    return "Амсайна ва амса-ль-мульку лиллях";

  // дефолт: вернём исходный латинский транслит (чтобы не скрыть контент)
  return zikr?.translit || "";
}
