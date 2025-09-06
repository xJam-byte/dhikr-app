// apps/api/src/recordings/recordings.service.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RecordingsService {
  constructor(private prisma: PrismaService) {}

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

    // антидубликат по checksum для этого пользователя
    const dup = await this.prisma.recording.findFirst({
      where: { checksum: dto.checksum, userId },
      select: { id: true, status: true },
    });
    if (dup) return dup;

    const rec = await this.prisma.recording.create({
      data: {
        userId,
        zikrId: dto.zikrId,
        checksum: dto.checksum,
        filename: dto.filename,
        sizeBytes: dto.sizeBytes,
        durationMs: dto.durationMs ? Number(dto.durationMs) : undefined,
        status: "QUEUED",
        text: "",
        score: 0.0,
      },
      select: { id: true, status: true /* если нужно: durationMs: true */ },
    });

    return rec; // без постановки в очередь — это делает контроллер
  }

  async get(id: string) {
    return this.prisma.recording.findUnique({ where: { id } });
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
