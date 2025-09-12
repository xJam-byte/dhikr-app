import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { VariantScript } from "@prisma/client"; // <— ИЗ PRISMA, не из своих утилит
import { log } from "node:console";

type VariantInput = {
  zikrId: string;
  lang: string; // "ar" | "ru" | "kz" ...
  script: "AR" | "LATIN" | "RU"; // вход может быть и "LAT"
  textRaw: string;
  textNorm: string;
  anchors?: string[];
  priority?: number;
};

// Маппинг входных строк к Prisma enum
function toVariantScript(s: VariantInput["script"]): VariantScript {
  switch (s) {
    case "AR":
      return VariantScript.AR;
    case "LATIN":
      return VariantScript.LATIN;
    case "RU":
      return VariantScript.RU;
    default:
      return VariantScript.LATIN;
  }
}

@Injectable()
export class ZikrVariantsService {
  constructor(private prisma: PrismaService) {}

  async upsertMany(variants: VariantInput[]) {
    const tasks = variants.map((v) => {
      const script = toVariantScript(v.script);
      return this.prisma.zikrVariant.upsert({
        where: {
          zikrId_script_textNorm: {
            zikrId: v.zikrId,
            script,
            textNorm: v.textNorm,
          },
        },
        update: {
          lang: v.lang,
          textRaw: v.textRaw,
          anchors: v.anchors ?? [],
          priority: v.priority ?? 0,
        },
        create: {
          zikrId: v.zikrId,
          lang: v.lang,
          script,
          textRaw: v.textRaw,
          textNorm: v.textNorm,
          anchors: v.anchors ?? [],
          priority: v.priority ?? 0,
        },
      });
    });

    return this.prisma.$transaction(tasks);
  }
  listByZikr(zikrId: string) {
    // console.log(`List variants for zikr ${zikrId}`);

    return this.prisma.zikrVariant.findMany({
      where: { zikrId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  getAll() {
    // console.log("Get all zikr variants");

    return this.prisma.zikrVariant.findMany({
      where: { id: { not: "" } },
    });
  }
}
