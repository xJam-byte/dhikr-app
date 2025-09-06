// apps/api/src/zikr-variants/zikr-variants.seed.ts
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../verify/text-utils";

const prisma = new PrismaClient();
type Script = "AR" | "LATIN" | "RU";

// Якори: убираем мусор, AR → 1 токен, прочие → до 2
function anchorsFromText(text: string, script: Script): string[] {
  const n = normalizeText(text);
  let tokens = n.split(/\s+/).filter(Boolean);

  // отфильтруем слишком короткие (wa, la и т.п.)
  const strong = tokens.filter((t) => t.length >= 3);
  if (strong.length > 0) tokens = strong;

  if (tokens.length === 0) return [];
  return script === "AR" ? tokens.slice(0, 1) : tokens.slice(0, 2);
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
      const textNorm = normalizeText(arRaw);
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

    // LATIN (транслит из БД)
    if (latRaw) {
      const textNorm = normalizeText(latRaw);
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
      const textNorm = normalizeText(enRaw);
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

    // RU → скрипт RU
    if (ruRaw) {
      const textNorm = normalizeText(ruRaw);
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

    // KZ → тоже RU (кириллица)
    if (kzRaw) {
      const textNorm = normalizeText(kzRaw);
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
