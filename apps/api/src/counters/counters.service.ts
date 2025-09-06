import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CountersService {
  constructor(private prisma: PrismaService) {}

  // ✅ безопасный апсерт пользователя по deviceId
  private async getOrCreateUserByDevice(deviceId: string) {
    return this.prisma.user.upsert({
      where: { deviceId },
      update: {},
      create: {
        deviceId,
        language: "ru",
        level: "BEGINNER",
        timezone: "UTC", // дефолт — чтобы не падать, если TZ не задана
      },
    });
  }

  // Вариант A: день считаем по пользовательской TZ (если нет — 'UTC')
  private getDayStartUtcForTz(now: Date, tz: string) {
    // Получаем локальные для TZ компоненты даты (год-месяц-день)
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);

    // Полночь локального дня в UTC (важно: Date.UTC → месяц 0-11)
    return new Date(Date.UTC(y, m - 1, d));
  }

  async todayByDevice(deviceId: string) {
    const user = await this.getOrCreateUserByDevice(deviceId);
    const tz = user.timezone ?? "UTC";

    const todayStartUtc = this.getDayStartUtcForTz(new Date(), tz);

    // dailyCounter.date хранится как UTC-полуночь (мы так и писали в воркере)
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
  async byZikrToday(deviceId: string) {
    const user = await this.getOrCreateUserByDevice(deviceId);
    const tz = user.timezone ?? "UTC";
    const todayStartUtc = this.getDayStartUtcForTz(new Date(), tz);

    const rows = await this.prisma.userZikrDaily.findMany({
      where: { userId: user.id, date: todayStartUtc },
      select: { zikrId: true, count: true, target: true, completed: true },
    });

    // чтобы фронт знал target даже если ещё нет строки — подтянем из Zikr
const ids = rows.map((r: { zikrId: string }) => r.zikrId);
const targets = await this.prisma.zikr.findMany({
  where: { id: { in: ids } },
  select: { id: true, target: true },
});
const tMap = new Map(targets.map((t: { id: string; target: number | null }) => [t.id, t.target ?? 33]));
return rows.map((r: { zikrId: string; count: number }) => ({
  zikrId: r.zikrId,
  count: r.count,
  target: tMap.get(r.zikrId) ?? 33,
}));
  }

  async totalByDevice(deviceId: string) {
    const user = await this.getOrCreateUserByDevice(deviceId);
    const total = await this.prisma.totalCounter.findUnique({
      where: { userId: user.id },
      select: { total: true },
    });
    return { totalCount: total?.total ?? 0 };
  }
}
