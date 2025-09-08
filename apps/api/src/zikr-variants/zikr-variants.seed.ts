// apps/api/src/zikr-variants/zikr-variants.seed.ts
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../verify/text-utils";

const prisma = new PrismaClient();
type Script = "AR" | "LATIN" | "RU";

// Быстрая нормализация (опираемся на твой normalizeText)
const norm = (s: string) => normalizeText(s || "");

// LATIN: генерируем и раздельные, и слитные формы + частые биграммы
function latinAnchors(textRaw: string): string[] {
  const n = norm(textRaw);
  if (!n) return [];
  const parts = n.split(/\s+/).filter(Boolean);

  const set = new Set<string>();

  // одиночные слова (отбрасываем совсем короткие)
  parts.forEach((p) => {
    if (p.length >= 3) set.add(p);
  });

  // склейки: вся фраза слитно и соседние пары
  if (parts.length >= 2) {
    set.add(parts.join("")); // вся фраза слитно
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i];
      const b = parts[i + 1];
      if (a.length >= 2 && b.length >= 2) {
        set.add(a + b); // subhanallah, allahuakbar, ...
        set.add(`${a} ${b}`); // дублируем и с пробелом
      }
    }
  }

  // спец-кейсы распространённых форм (таухид, хамдулилля, и т.п.)
  const tight = n.replace(/\s+/g, "");
  if (/^lailahaill?allah$/.test(tight)) {
    set.add("la ilaha illallah");
    set.add("lailahaillallah");
    set.add("illallah");
  }
  // hamdulillah / alhamdulillah
  if (tight.includes("hamdulillah") || tight.includes("alhamdulillah")) {
    set.add("hamdulillah");
    set.add("alhamdulillah");
  }
  // hasbunallahu wa nimal wakil
  if (tight.includes("hasbunallahu")) {
    set.add("hasbunallahu");
    set.add("hasbunallahuwanimalwakil");
    set.add("alwakil");
  }
  // la hawla wa la quwwata
  if (tight.includes("lahawla") || tight.includes("quwwata")) {
    set.add("la hawla");
    set.add("quwwata");
    set.add("illa billah");
    set.add("lahawlawalaquwwataillabillah");
  }

  // ограничим размер набора для скорости
  return Array.from(set).slice(0, 12);
}

// AR/RU: якоря на основе токенов (1 для арабского, до 2 для кириллицы)
function anchorsFromText(text: string, script: Script): string[] {
  const n = norm(text);
  if (!n) return [];
  let tokens = n.split(/\s+/).filter(Boolean);

  // убрать совсем короткие
  tokens = tokens.filter((t) => t.length >= 3);
  if (!tokens.length) return [];

  if (script === "AR") return tokens.slice(0, 1);
  if (script === "RU") return tokens.slice(0, 2);
  // для LATIN используем расширенный генератор
  return latinAnchors(text);
}

export async function seedBasicVariants() {
  const zikrs = await prisma.zikr.findMany({
    include: { translations: true },
  });

  let upserted = 0;

  for (const z of zikrs) {
    const arRaw = (z.arabicText || "").trim();
    const latRaw = (z.translit || "").trim();

    const ruRaw =
      z.translations?.find((t) => t.lang === "ru")?.text?.trim() || "";
    const kzRaw =
      z.translations?.find((t) => t.lang === "kz")?.text?.trim() || "";
    const enRaw =
      z.translations?.find((t) => t.lang === "en")?.text?.trim() || "";

    type Item = {
      lang: string;
      script: Script;
      textRaw: string;
      textNorm: string;
      anchors: string[];
      priority: number;
    };

    const items: Item[] = [];

    // AR
    if (arRaw) {
      const textNorm = norm(arRaw);
      if (textNorm) {
        items.push({
          lang: "ar",
          script: "AR",
          textRaw: arRaw,
          textNorm,
          anchors: anchorsFromText(arRaw, "AR"),
          priority: 100,
        });
      }
    }

    // LATIN (транслит)
    if (latRaw) {
      const textNorm = norm(latRaw);
      if (textNorm) {
        items.push({
          lang: "lat",
          script: "LATIN",
          textRaw: latRaw,
          textNorm,
          anchors: anchorsFromText(latRaw, "LATIN"),
          priority: 80,
        });
      }
    }

    // EN → тоже LATIN
    if (enRaw) {
      const textNorm = norm(enRaw);
      if (textNorm) {
        items.push({
          lang: "en",
          script: "LATIN",
          textRaw: enRaw,
          textNorm,
          anchors: anchorsFromText(enRaw, "LATIN"),
          priority: 50,
        });
      }
    }

    // RU
    if (ruRaw) {
      const textNorm = norm(ruRaw);
      if (textNorm) {
        items.push({
          lang: "ru",
          script: "RU",
          textRaw: ruRaw,
          textNorm,
          anchors: anchorsFromText(ruRaw, "RU"),
          priority: 30,
        });
      }
    }

    // KZ → кириллица
    if (kzRaw) {
      const textNorm = norm(kzRaw);
      if (textNorm) {
        items.push({
          lang: "kz",
          script: "RU",
          textRaw: kzRaw,
          textNorm,
          anchors: anchorsFromText(kzRaw, "RU"),
          priority: 30,
        });
      }
    }

    for (const it of items) {
      await prisma.zikrVariant.upsert({
        where: {
          zikrId_script_textNorm: {
            zikrId: z.id,
            script: it.script as any,
            textNorm: it.textNorm,
          } as any,
        },
        update: {
          lang: it.lang,
          textRaw: it.textRaw,
          anchors: it.anchors,
          priority: it.priority,
        },
        create: {
          zikrId: z.id,
          lang: it.lang,
          script: it.script as any,
          textRaw: it.textRaw,
          textNorm: it.textNorm,
          anchors: it.anchors,
          priority: it.priority,
        },
      });
      upserted++;
    }
  }

  console.log(`✅ seed variants done. upserted: ${upserted}`);
}
