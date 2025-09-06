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
exports.CountersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CountersService = class CountersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOrCreateUserByDevice(deviceId) {
        return this.prisma.user.upsert({
            where: { deviceId },
            update: {},
            create: {
                deviceId,
                language: "ru",
                level: "BEGINNER",
                timezone: "UTC",
            },
        });
    }
    getDayStartUtcForTz(now, tz) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(now);
        const y = Number(parts.find((p) => p.type === "year")?.value);
        const m = Number(parts.find((p) => p.type === "month")?.value);
        const d = Number(parts.find((p) => p.type === "day")?.value);
        return new Date(Date.UTC(y, m - 1, d));
    }
    async todayByDevice(deviceId) {
        const user = await this.getOrCreateUserByDevice(deviceId);
        const tz = user.timezone ?? "UTC";
        const todayStartUtc = this.getDayStartUtcForTz(new Date(), tz);
        const daily = await this.prisma.dailyCounter.findUnique({
            where: { userId_date: { userId: user.id, date: todayStartUtc } },
            select: { count: true },
        });
        const total = await this.prisma.totalCounter.findUnique({
            where: { userId: user.id },
            select: { total: true },
        });
        return {
            todayCount: daily?.count ?? 0,
            totalCount: total?.total ?? 0,
        };
    }
    async byZikrToday(deviceId) {
        const user = await this.getOrCreateUserByDevice(deviceId);
        const tz = user.timezone ?? "UTC";
        const todayStartUtc = this.getDayStartUtcForTz(new Date(), tz);
        const rows = await this.prisma.userZikrDaily.findMany({
            where: { userId: user.id, date: todayStartUtc },
            select: { zikrId: true, count: true, target: true, completed: true },
        });
        const ids = rows.map((r) => r.zikrId);
        const targets = await this.prisma.zikr.findMany({
            where: ids.length ? { id: { in: ids } } : undefined,
            select: { id: true, target: true },
        });
        const tMap = new Map(targets.map((t) => [t.id, t.target ?? 33]));
        return rows.map((r) => ({
            zikrId: r.zikrId,
            count: r.count,
            target: r.target ?? tMap.get(r.zikrId) ?? 33,
            completed: r.completed,
        }));
    }
    async totalByDevice(deviceId) {
        const user = await this.getOrCreateUserByDevice(deviceId);
        const total = await this.prisma.totalCounter.findUnique({
            where: { userId: user.id },
            select: { total: true },
        });
        return { totalCount: total?.total ?? 0 };
    }
};
exports.CountersService = CountersService;
exports.CountersService = CountersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CountersService);
//# sourceMappingURL=counters.service.js.map