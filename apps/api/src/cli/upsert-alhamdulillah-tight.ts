import { PrismaClient } from "@prisma/client";
import { normalizeText } from "src/verify/text-utils";

const prisma = new PrismaClient();
const ZID = "0f6a46cc-7d95-41bd-ad21-43cdc04a816b"; // Allahu Akbar

const norm = (s: string) => normalizeText(s || "");

type V = {
  script: "AR" | "LATIN" | "RU";
  lang: string;
  textRaw: string;
  textNorm: string;
  anchors: string[];
  priority: number;
};

const variants: V[] = [
  // Каноника
  {
    script: "AR",
    lang: "ar",
    textRaw: "اللَّهُ أَكْبَرُ",
    textNorm: norm("الله أكبر"),
    anchors: ["الله", "أكبر", "اكبر", "كبر"],
    priority: 100,
  },
  {
    script: "AR",
    lang: "ar",
    textRaw: "الله أكبر",
    textNorm: norm("الله أكبر"),
    anchors: ["الله", "أكبر", "اكبر", "كبر"],
    priority: 98,
  },
  {
    script: "AR",
    lang: "ar",
    textRaw: "الله اكبر",
    textNorm: norm("الله اكبر"),
    anchors: ["الله", "اكبر", "كبر"],
    priority: 95,
  },

  // Частые искажения ASR → добавляем «كبير» (kabir/kabeer)
  {
    script: "AR",
    lang: "ar",
    textRaw: "الله كبير",
    textNorm: norm("الله كبير"),
    anchors: ["الله", "كبير", "كبر"], // «كبر» как корень
    priority: 55,
  },
  {
    script: "AR",
    lang: "ar",
    textRaw: "الله وكبير",
    textNorm: norm("الله وكبير"),
    anchors: ["الله", "كبير", "كبر"],
    priority: 52,
  },
  {
    script: "AR",
    lang: "ar",
    textRaw: "الله أكثر",
    textNorm: norm("الله أكثر"),
    anchors: ["الله", "اكثر", "كبر"], // даём корень «كبر» для страховки
    priority: 50,
  },

  // LATIN (в т.ч. tight)
  {
    script: "LATIN",
    lang: "lat",
    textRaw: "Allahu akbar",
    textNorm: norm("Allahu akbar"),
    anchors: ["allah", "allahu", "akbar", "allahuakbar", "kabir", "kabeer"],
    priority: 90,
  },
  {
    script: "LATIN",
    lang: "lat",
    textRaw: "Allahuakbar",
    textNorm: norm("Allahuakbar"),
    anchors: ["allahu", "akbar", "allahuakbar", "kabir", "kabeer"],
    priority: 86,
  },
  {
    script: "LATIN",
    lang: "lat",
    textRaw: "Allāhu akbar",
    textNorm: norm("Allāhu akbar"),
    anchors: [
      "allāhu",
      "akbar",
      "allāhuakbar",
      "allahu",
      "allahuakbar",
      "kabir",
      "kabeer",
    ],
    priority: 84,
  },

  // RU
  {
    script: "RU",
    lang: "ru",
    textRaw: "Аллаху Акбар",
    textNorm: norm("Аллаху Акбар"),
    anchors: ["аллаху", "акбар", "аллахуакбар", "великий"],
    priority: 70,
  },
  {
    script: "RU",
    lang: "ru",
    textRaw: "Аллах велик",
    textNorm: norm("Аллах велик"),
    anchors: ["аллах", "велик", "великий"],
    priority: 60,
  },
];

async function main() {
  let upserted = 0;
  for (const it of variants) {
    if (!it.textNorm) continue;
    await prisma.zikrVariant.upsert({
      where: {
        zikrId_script_textNorm: {
          zikrId: ZID,
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
        zikrId: ZID,
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
  console.log(`✅ upsert Allahu Akbar variants done. upserted=${upserted}`);
}

main()
  .catch((e) => {
    console.error("❌ upsert error:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
