import { PrismaClient } from "@prisma/client";
import { normalizeText } from "src/verify/text-utils";

const prisma = new PrismaClient();
type Script = "AR" | "LATIN" | "RU";

// ──────────────────────────────────────────────────────────────────────────────
// Быстрая нормализация
const norm = (s: string) => normalizeText(s || "");

// LATIN: склейки/биграммы + популярные формы
function latinAnchors(textRaw: string): string[] {
  const n = norm(textRaw);
  if (!n) return [];
  const parts = n.split(/\s+/).filter(Boolean);

  const set = new Set<string>();
  parts.forEach((p) => {
    if (p.length >= 3) set.add(p);
  });

  if (parts.length >= 2) {
    set.add(parts.join("")); // вся фраза слитно
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i];
      const b = parts[i + 1];
      if (a.length >= 2 && b.length >= 2) {
        set.add(a + b);
        set.add(`${a} ${b}`);
      }
    }
  }

  const tight = n.replace(/\s+/g, "");
  if (/^lailahaill?allah$/.test(tight)) {
    set.add("la ilaha illallah");
    set.add("lailahaillallah");
    set.add("illallah");
  }
  if (tight.includes("hamdulillah") || tight.includes("alhamdulillah")) {
    set.add("hamdulillah");
    set.add("alhamdulillah");
  }
  if (tight.includes("hasbunallahu")) {
    set.add("hasbunallahu");
    set.add("hasbunallahuwanimalwakil");
    set.add("alwakil");
  }
  if (tight.includes("lahawla") || tight.includes("quwwata")) {
    set.add("la hawla");
    set.add("quwwata");
    set.add("illa billah");
    set.add("lahawlawalaquwwataillabillah");
  }

  return Array.from(set).slice(0, 12);
}

// Ручные «сильные» якоря (LATIN) по твоим ID
const STRONG_LATIN_BY_ID: Record<string, string[]> = {
  "5f090c57-cbc1-46b8-aa7c-b59a12d6188e": ["subhan", "allah"], // Subhanallah
  "de24d25e-dd3b-4b4d-8f69-bee68c9acf0e": ["hamd", "lillah"], // Al-hamdu lillah
  "0f6a46cc-7d95-41bd-ad21-43cdc04a816b": ["allahu", "akbar"], // Allahu akbar
  "37cbb522-fde8-49c7-8ebd-087bdb4de062": ["ilaha", "illa", "allah"], // La ilaha illa Allah
  "a1b07365-389f-4bb2-8f28-ca5d3017af67": ["astaghfir", "allah"], // Astaghfirullah
  "4568779e-fc4b-41d7-a370-e5e5e8393c9c": ["bismillah"], // Bismillah
  "4a694b49-2fe7-4f7e-8f93-19922b87c3d7": ["hasbunallahu", "wakil"], // Hasbunallahu wa ni'mal wakil
  "e231d94a-d03c-4f64-afb9-d16b03b4d9ae": ["hawla", "quwwata"], // La hawla wa la quwwata...
  "9206bd74-897f-47e3-9580-a293ea1fe5cd": ["subhanallahi", "bihamdih"], // Subhanallahi wa bihamdih
  "d0d7ffe7-3c12-4f43-9c68-4b116d60988c": ["subhanallahi", "azim"], // Subhanallahi al-Azim
};

// Ручные «сильные» якоря (AR) по тем же ID (без фильтра по длине)
const STRONG_AR_BY_ID: Record<string, string[]> = {
  "5f090c57-cbc1-46b8-aa7c-b59a12d6188e": ["سبحان", "الله"],
  "de24d25e-dd3b-4b4d-8f69-bee68c9acf0e": ["الحمد", "لله"],
  "0f6a46cc-7d95-41bd-ad21-43cdc04a816b": ["الله", "أكبر"],
  "37cbb522-fde8-49c7-8ebd-087bdb4de062": ["لا", "إله", "إلا", "الله"],
  "a1b07365-389f-4bb2-8f28-ca5d3017af67": ["أستغفر", "الله"],
  "4568779e-fc4b-41d7-a370-e5e5e8393c9c": ["بسم", "الله"],
  "4a694b49-2fe7-4f7e-8f93-19922b87c3d7": ["حسبنا", "الله", "الوكيل"],
  "e231d94a-d03c-4f64-afb9-d16b03b4d9ae": ["لا", "حول", "قوة", "إلا", "بالله"],
  "9206bd74-897f-47e3-9580-a293ea1fe5cd": ["سبحان", "الله", "وبحمده"],
  "d0d7ffe7-3c12-4f43-9c68-4b116d60988c": ["سبحان", "الله", "العظيم"],
};

// AR/RU: якоря на основе токенов (AR — 2 токена, RU — до 2), LATIN — расширенный генератор
function anchorsFromText(text: string, script: Script): string[] {
  const n = norm(text);
  if (!n) return [];
  let tokens = n.split(/\s+/).filter(Boolean);

  // убрать совсем короткие
  tokens = tokens.filter((t) => t.length >= 3);
  if (!tokens.length) return [];

  if (script === "AR") return tokens.slice(0, 2);
  if (script === "RU") return tokens.slice(0, 2);
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
        const baseAnch = anchorsFromText(arRaw, "AR");
        const manual = (STRONG_AR_BY_ID[z.id] || []).map(norm);
        const anchors = Array.from(new Set([...manual, ...baseAnch])).slice(
          0,
          12
        );
        items.push({
          lang: "ar",
          script: "AR",
          textRaw: arRaw,
          textNorm,
          anchors,
          priority: 100,
        });
      }
    }

    // LATIN (транслит)
    if (latRaw) {
      const textNorm = norm(latRaw);
      if (textNorm) {
        const baseAnch = anchorsFromText(latRaw, "LATIN");
        const manual = (STRONG_LATIN_BY_ID[z.id] || []).map(norm);
        const anchors = Array.from(new Set([...manual, ...baseAnch])).slice(
          0,
          12
        );
        items.push({
          lang: "lat",
          script: "LATIN",
          textRaw: latRaw,
          textNorm,
          anchors,
          priority: 80,
        });
      }
    }

    // EN → тоже LATIN (низкий приоритет)
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
          // нужен составной уникальный индекс на (zikrId, script, textNorm)
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

async function main() {
  console.log("⚠️  clearing zikrVariant...");
  await prisma.zikrVariant.deleteMany({});
  console.log("➡️  reseeding variants...");
  await seedBasicVariants();
  console.log("🎉 done");
}

main()
  .catch((e) => {
    console.error("❌ seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
