"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZikrService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
function normalizeTranslations(input) {
    if (Array.isArray(input)) {
        return input.map((t) => ({ lang: t.lang, text: t.text }));
    }
    return Object.entries(input).map(([lang, text]) => ({ lang, text }));
}
let ZikrService = class ZikrService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    list(lang, q, limit = 20, offset = 0) {
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
    get(id) {
        return this.prisma.zikr.findUnique({
            where: { id },
            include: { translations: true },
        });
    }
    async create(dto) {
        const translations = normalizeTranslations(dto.translations);
        return this.prisma.zikr.create({
            data: {
                arabicText: dto.arabicText,
                translit: dto.translit,
                translations: { create: translations },
            },
            include: { translations: true },
        });
    }
    async createBulk(items) {
        return this.prisma.$transaction(items.map((dto) => {
            const translations = normalizeTranslations(dto.translations);
            return this.prisma.zikr.create({
                data: {
                    arabicText: dto.arabicText,
                    translit: dto.translit,
                    translations: { create: translations },
                },
                include: { translations: true },
            });
        }));
    }
    async bulkUpdate(items) {
        const cleaned = items.map((i) => ({
            id: String(i.id).trim(),
            category: i.category === undefined ? undefined : i.category ?? null,
            target: typeof i.target === "number"
                ? i.target
                : i.target === null
                    ? null
                    : undefined,
        }));
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
        const results = await Promise.allSettled(toUpdate.map((i) => this.prisma.zikr.update({
            where: { id: i.id },
            data: {
                category: i.category !== undefined ? i.category : undefined,
                target: i.target !== undefined ? i.target : undefined,
            },
        })));
        const updated = results.filter((r) => r.status === "fulfilled").length;
        const failedIds = results
            .map((r, idx) => ({ r, idx }))
            .filter((x) => x.r.status === "rejected")
            .map((x) => toUpdate[x.idx].id);
        return { updated, missingIds, failedIds };
    }
};
exports.ZikrService = ZikrService;
exports.ZikrService = ZikrService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ZikrService);
//# sourceMappingURL=zikr.service.js.map