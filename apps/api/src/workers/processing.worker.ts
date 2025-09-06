// apps/api/src/workers/processing.worker.ts
import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs/promises";
import { createAsr } from "../verify/asr";
import { normalizeText } from "../verify/text-utils";
import { matchScore } from "../verify/matcher";
import { countRepeats } from "../verify/repeat-counter";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const prisma = new PrismaClient();
const asr = createAsr();

const QUEUE = "processingQueue";
const JOB = "process-recording";

// — пороги/окна —
const MIN_MS = 350; // слишком короткие — сразу FAIL
const BEGINNER_MIN_ANCHORS = 1; // требуемые якоря
const ADVANCED_MIN_ANCHORS = 2;
const DUP_MS = 2500; // анти-дубль окно
const MIN_ASR_LEN = 2; // пустой текст отбрасываем

type JobData = {
  recordingId: string;
  userId: string;
  zikrId: string;
  filePath: string;
  durationMs: number | null;
};

function dayStartUtcForTz(now: Date, tz: string) {
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

async function safeUnlink(p?: string | null) {
  if (!p) return;
  try {
    await fs.unlink(p);
  } catch {}
}

async function fail(id: string, reason: string, text = "", score = 0) {
  console.log("[FAIL]", id, reason);
  await prisma.recording.update({
    where: { id },
    data: { status: "FAILED", processedAt: new Date(), text, score },
  });
}

async function processJob(data: JobData) {
  const { recordingId, userId, zikrId, filePath } = data;
  let { durationMs } = data;

  console.log("[job]", { recordingId, userId, zikrId, durationMs, filePath });

  // 0) mark PROCESSING
  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "PROCESSING" },
  });

  // 1) Быстрая отбраковка длины
  if (!durationMs || durationMs < MIN_MS) {
    await fail(recordingId, "too-short");
    await safeUnlink(filePath);
    return;
  }

  // 2) Варианты для зикра
  const variants = await prisma.zikrVariant.findMany({
    where: { zikrId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: { script: true, textNorm: true, anchors: true, priority: true },
  });
  console.log("[variants.count]", variants.length);
  if (!variants.length) {
    await fail(recordingId, "no-variants");
    await safeUnlink(filePath);
    return;
  }

  // 3) Пользователь (уровень, TZ)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, timezone: true, language: true },
  });
  const userLevel = (user?.level || "BEGINNER") as "BEGINNER" | "ADVANCED";
  const tz = user?.timezone || "UTC";
  console.log("[user.level]", userLevel);

  // 4) ASR
  let asrText = "";
  let asrConf = 0;
  try {
    // Подсказываем язык, если храните его у пользователя (ru/kz/en/ar)
    const hintLang =
      user?.language && ["ru", "kz", "en", "ar"].includes(user.language)
        ? user.language
        : "auto";

    const r = await asr.transcribe(filePath);
    asrText = (r.text || "").trim();
    asrConf = r.conf || 0;
  } catch (e) {
    console.log("[asr.error]", (e as Error).message);
  }
  console.log("[asr]", { text: asrText, conf: asrConf });

  const normText = normalizeText(asrText);
  if (!normText || normText.length < MIN_ASR_LEN) {
    await fail(recordingId, "empty-asr", asrText, 0.05);
    await safeUnlink(filePath);
    return;
  }

  // 5) Матчинг (score + anchorsHit + threshold)
  const m = matchScore({ asrText, userLevel, variants: variants as any });
  console.log("[match]", m);
  const minAnchors =
    userLevel === "BEGINNER" ? BEGINNER_MIN_ANCHORS : ADVANCED_MIN_ANCHORS;

  if (!m.ok || (m.anchorsHit || 0) < minAnchors) {
    await fail(
      recordingId,
      !m.ok ? "below-threshold" : `anchors<${minAnchors}`,
      asrText,
      m.score ?? 0.2
    );
    await safeUnlink(filePath);
    return;
  }

  // 6) Подсчёт повторов (быстрая речь: «…субханаллах субханаллах…»)
  // countRepeats ожидает нормализованный текст и список нормализованных эталонов
  let repeats = 1;
  try {
    const patterns = variants.map((v) => v.textNorm);
    const rep = countRepeats(normText, variants);
    if (rep && typeof rep.totalRepeats === "number" && rep.totalRepeats >= 1) {
      repeats = rep.totalRepeats;
    }
  } catch (e) {
    // если что-то пошло не так — считаем как 1
  }
  console.log("[repeats]", repeats);

  // 7) Анти-дубль окно — не позволяем насыпать повторно за один и тот же отрезок
  // (всё равно оставляем, даже с подсчётом повторов)
  const duplicate = await prisma.recording.findFirst({
    where: {
      userId,
      zikrId,
      status: "DONE",
      processedAt: { gte: new Date(Date.now() - DUP_MS) },
    },
    select: { id: true },
    orderBy: { processedAt: "desc" },
  });
  if (duplicate) {
    await fail(recordingId, "duplicate-window", asrText, m.score ?? 0.8);
    await safeUnlink(filePath);
    return;
  }

  // 8) Фиксация результата и инкремент счётчиков на repeats
  const dayStart = dayStartUtcForTz(new Date(), tz);

  await prisma.$transaction(async (tx) => {
    await tx.recording.update({
      where: { id: recordingId },
      data: {
        status: "DONE",
        processedAt: new Date(),
        text: asrText,
        score: m.score ?? 0.85,
      },
    });

    // глобальные
    await tx.dailyCounter.upsert({
      where: { userId_date: { userId, date: dayStart } },
      update: { count: { increment: repeats } },
      create: { userId, date: dayStart, count: repeats },
    });
    await tx.totalCounter.upsert({
      where: { userId },
      update: { total: { increment: repeats } },
      create: { userId, total: repeats },
    });

    // пер-зикровые
    const zikr = await tx.zikr.findUnique({
      where: { id: zikrId },
      select: { target: true },
    });
    const target = zikr?.target ?? 33;

    const dz = await tx.userZikrDaily.upsert({
      where: { userId_zikrId_date: { userId, zikrId, date: dayStart } as any },
      update: { count: { increment: repeats } },
      create: {
        userId,
        zikrId,
        date: dayStart,
        count: repeats,
        target,
        completed: false,
      },
    });

    if (!dz.completed && dz.count + repeats >= (dz.target ?? target)) {
      await tx.userZikrDaily.update({
        where: { id: dz.id },
        data: { completed: true },
      });
    }
  });

  await safeUnlink(filePath);
}

// ————————————————————————————————————————————

new Worker(
  QUEUE,
  async (job) => {
    if (job.name !== JOB) return;
    await processJob(job.data as JobData);
  },
  { connection, concurrency: 2 }
)
  .on("completed", (job) => console.log("✅ worker done", job.id))
  .on("failed", (job, err) => console.error("❌ worker failed", job?.id, err));
