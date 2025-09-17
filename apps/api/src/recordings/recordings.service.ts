import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RecordingsService {
  constructor(private prisma: PrismaService) {}

  async findDuplicateByChecksum(userId: string, checksum: string) {
    if (!userId) throw new BadRequestException("Missing userId");
    if (!checksum) throw new BadRequestException("Missing checksum");

    return this.prisma.recording.findFirst({
      where: { userId, checksum },
      select: {
        id: true,
        status: true,
        repeats: true,
        score: true,
        text: true,
      },
      orderBy: { createdAt: "desc" }, // на всякий
    });
  }

  async createForUser(
    userId: string,
    dto: {
      checksum: string;
      zikrId: string;
      filename: string;
      sizeBytes?: number;
      durationMs?: number;
    }
  ) {
    if (!userId) throw new BadRequestException("Missing userId");
    if (!dto?.checksum) throw new BadRequestException("Missing checksum");
    if (!dto?.zikrId) throw new BadRequestException("Missing zikrId");

    const rec = await this.prisma.recording.create({
      data: {
        userId,
        zikrId: dto.zikrId,
        checksum: dto.checksum,
        filename: dto.filename,
        sizeBytes: dto.sizeBytes,
        durationMs: dto.durationMs ? Number(dto.durationMs) : null,
        status: "QUEUED",
        text: "",
        score: 0.0,
      },
      select: { id: true, status: true },
    });

    return rec;
  }

  async get(id: string) {
    const r = await this.prisma.recording.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        repeats: true,
        score: true,
        text: true,
      },
    });
    if (!r) throw new BadRequestException("not_found");

    // Если хочешь, чтобы 0 тоже отображался как 0 — убери Math.max:
    return {
      id: r.id,
      status: r.status,
      repeats: r.repeats ?? 0,
      score: r.score ?? undefined,
      text: r.text ?? undefined,
    };
  }

  async deleteByDevice(deviceId: string, recId: string) {
    const user = await this.prisma.user.findUnique({ where: { deviceId } });
    if (!user) return { deleted: 0 };
    const res = await this.prisma.recording.deleteMany({
      where: { id: recId, userId: user.id },
    });
    return { deleted: res.count };
  }
}
