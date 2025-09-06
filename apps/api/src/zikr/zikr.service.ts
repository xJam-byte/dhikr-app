// apps/api/src/zikr/zikr.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type TranslationArray = Array<{ lang: string; text: string }>;
type TranslationMap = Record<string, string>;

type ZikrItem = {
  arabicText: string;
  translit: string;
  translations: TranslationArray | TranslationMap;
  category?: string; //// раскомментируй, если добавишь в Prisma
  target?: number; //// раскомментируй, если добавишь в Prisma
};

function normalizeTranslations(input: TranslationArray | TranslationMap) {
  if (Array.isArray(input)) {
    return input.map((t) => ({ lang: t.lang, text: t.text }));
  }
  return Object.entries(input).map(([lang, text]) => ({ lang, text }));
}

@Injectable()
export class ZikrService {
  constructor(private prisma: PrismaService) {}

  list(lang?: string, q?: string, limit = 20, offset = 0) {
    return this.prisma.zikr.findMany({
      take: limit,
      skip: offset,
      where: q
        ? {
            OR: [
              { arabicText: { contains: q } },
              { translit: { contains: q, mode: "insensitive" } },
              {
                translations: {
                  some: { text: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          }
        : undefined,
      include: { translations: true },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.prisma.zikr.findUnique({
      where: { id },
      include: { translations: true },
    });
  }

  async create(dto: ZikrItem) {
    const translations = normalizeTranslations(dto.translations);

    // Если уже добавил поля category/target в Prisma — сюда их можно вписать.
    return this.prisma.zikr.create({
      data: {
        arabicText: dto.arabicText,
        translit: dto.translit,
        category: (dto as any).category,
        target: (dto as any).target,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  async createBulk(items: ZikrItem[]) {
    return this.prisma.$transaction(
      items.map((dto) => {
        const translations = normalizeTranslations(dto.translations);
        return this.prisma.zikr.create({
          data: {
            arabicText: dto.arabicText,
            translit: dto.translit,
            category: (dto as any).category,
            target: (dto as any).target,
            translations: { create: translations },
          },
          include: { translations: true },
        });
      })
    );
  }

  async bulkUpdate(
    items: Array<{
      id: string;
      category?: string | null;
      target?: number | null;
    }>
  ) {
    // 1) нормализуем вход
    const cleaned = items.map((i) => ({
      id: String(i.id).trim(),
      category: i.category === undefined ? undefined : i.category ?? null,
      target:
        typeof i.target === "number"
          ? i.target
          : i.target === null
          ? null
          : undefined,
    }));

    // 2) узнаём, какие id реально существуют
    const ids = cleaned.map((i) => i.id);
    const existing = await this.prisma.zikr.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((x) => x.id));

    const toUpdate = cleaned.filter((i) => existingSet.has(i.id));
    const missingIds = cleaned
      .filter((i) => !existingSet.has(i.id))
      .map((i) => i.id);

    // 3) обновляем только существующие записи, устойчиво
    const results = await Promise.allSettled(
      toUpdate.map((i) =>
        this.prisma.zikr.update({
          where: { id: i.id },
          data: {
            category: i.category !== undefined ? i.category : undefined,
            target: i.target !== undefined ? i.target : undefined,
          },
        })
      )
    );

    const updated = results.filter((r) => r.status === "fulfilled").length;
    const failedIds = results
      .map((r, idx) => ({ r, idx }))
      .filter((x) => x.r.status === "rejected")
      .map((x) => toUpdate[x.idx].id);

    return { updated, missingIds, failedIds };
  }
}
