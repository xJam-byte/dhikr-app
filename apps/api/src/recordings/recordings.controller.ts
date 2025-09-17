import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
  Delete,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { RecordingsService } from "./recordings.service";
import { QueuesService } from "src/queues/queues.service";
import { PrismaService } from "src/prisma/prisma.service";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { v4 as uuid } from "uuid";
import * as crypto from "node:crypto";

const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller("v1/recordings")
export class RecordingsController {
  constructor(
    private service: RecordingsService,
    private queues: QueuesService,
    private prisma: PrismaService
  ) {
    ensureUploadsDir();
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    })
  )
  async upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body("zikrId") zikrId: string,
    @Body("durationMs") durationMs?: string
  ) {
    const deviceId = (req.headers["x-device-id"] as string) || "unknown";
    const hdr = (
      req.headers["x-recog-mode"] as string | undefined
    )?.toLowerCase();
    const recogMode =
      hdr === "arabic" ? "arabic" : hdr === "auto" ? "auto" : "latin";

    if (!file) throw new BadRequestException("file required");
    if (!zikrId) throw new BadRequestException("zikrId required");
    if (file.size < 1024) throw new BadRequestException("empty audio");
    if (!file.mimetype?.startsWith("audio/"))
      throw new BadRequestException("invalid mime");

    // гарантируем пользователя
    const user = await this.prisma.user.upsert({
      where: { deviceId },
      update: {},
      create: { deviceId, language: "ru", level: "BEGINNER", timezone: "UTC" },
      select: { id: true },
    });

    // считаем checksum прямо по буферу
    const checksum = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");

    // 1) Ищем дубликат СРАЗУ (до записи файла на диск!)
    const dup = await this.service.findDuplicateByChecksum(user.id, checksum);
    if (dup) {
      // ничего не пишем, ничего не ставим в очередь
      return {
        id: dup.id,
        status: dup.status,
        duplicate: true,
        message: "Already uploaded recently",
      };
    }

    // 2) Пишем файл на диск, раз дубликата нет
    const rawExt = (file.originalname || "").split(".").pop() || "";
    const safeExt = ["m4a", "wav", "mp3", "aac", "ogg", "webm"].includes(
      rawExt.toLowerCase()
    )
      ? rawExt.toLowerCase()
      : "m4a";
    const diskName = `${uuid()}.${safeExt}`;
    const filePath = path.join(UPLOAD_DIR, diskName);
    await fsp.writeFile(filePath, file.buffer);

    // 3) Создаём запись
    const rec = await this.service.createForUser(user.id, {
      checksum,
      zikrId,
      filename: diskName,
      sizeBytes: file.size,
      durationMs: durationMs ? Number(durationMs) : undefined,
    });

    // 4) Кладём в очередь
    try {
      await this.queues.enqueueProcessingJob({
        recordingId: rec.id,
        userId: user.id,
        zikrId,
        filePath,
        durationMs: durationMs ? Number(durationMs) : null,
        recogMode,
      });
    } catch (e) {
      // если очередь не доступна — пометим как FAILED,
      // чтобы фронт сразу увидел реальный статус
      await this.prisma.recording.update({
        where: { id: rec.id },
        data: {
          status: "FAILED",
          processedAt: new Date(),
          text: "queue-error",
        },
      });
      throw e;
    }

    return { id: rec.id, status: rec.status, message: "Queued for processing" };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const deviceId = req.headers["x-device-id"] as string;
    if (!deviceId) throw new BadRequestException("Missing X-Device-Id header");
    return this.service.deleteByDevice(deviceId, id);
  }
}
