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
const MIN_MS = 350;
const DUP_MS = 2500;
const MIN_ASR_LEN = 2;

// caps для повторов
const HARD_CAP = 5;
const AVG_MS_BEGINNER = 1200;
const AVG_MS_ADVANCED = 1000;

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

// объединённые якоря по всем вариантам
function unionAnchorsFromVariants(variants: Array<{ anchors: any }>): string[] {
  const set = new Set<string>();
  for (const v of variants) {
    const arr = (v.anchors || []) as string[];
    for (const a of arr) {
      if (typeof a === "string" && a.trim()) set.add(a.trim());
    }
  }
  // ограничим длину списка
  return Array.from(set).slice(0, 12);
}

function countAnchorHits(asrNorm: string, anchors: string[]): number {
  const hay1 = asrNorm;
  const hay2 = asrNorm.replace(/\s+/g, "");
  let hits = 0;
  for (const a of anchors) {
    const needle = a.toLowerCase();
    if (!needle) continue;
    const n2 = needle.replace(/\s+/g, "");
    if (hay1.includes(needle) || hay2.includes(n2)) hits++;
  }
  return hits;
}

function tokenCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

async function processJob(data: JobData) {
  const { recordingId, userId, zikrId, filePath } = data;
  let { durationMs } = data;

  console.log("[job]", { recordingId, userId, zikrId, durationMs, filePath });

  // mark PROCESSING
  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "PROCESSING" },
  });

  // быстрый отсев
  if (!durationMs || durationMs < MIN_MS) {
    await fail(recordingId, "too-short");
    await safeUnlink(filePath);
    return;
  }

  // варианты зикра
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

  // пользователь
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, timezone: true, language: true },
  });
  const userLevel = (user?.level || "BEGINNER") as "BEGINNER" | "ADVANCED";
  const tz = user?.timezone || "UTC";
  console.log("[user.level]", userLevel);

  // ASR
  let asrText = "";
  let asrConf = 0;
  try {
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

  // Основной скор по тексту
  const m = matchScore({ asrText, userLevel, variants: variants as any });
  console.log("[match]", m);

  // Смягчаем anchors для коротких зикров/высокого score/новичков
  const minWords = Math.min(
    ...variants.map((v) => tokenCount(v.textNorm || "") || 99)
  );
  const shortZikr = minWords <= 3;
  const highScore =
    (m?.score ?? 0) >= Math.max((m?.threshold ?? 0.62) + 0.25, 0.9);
  const relaxForBeginner = userLevel === "BEGINNER";

  // Пересчёт попаданий якорей подстрочно (слитные формы)
  const anchorsUnion = unionAnchorsFromVariants(variants as any);
  const anchorsHit2 = countAnchorHits(normText, anchorsUnion);

  if (
    !m.ok ||
    (anchorsHit2 < 1 && !shortZikr && !highScore && !relaxForBeginner)
  ) {
    await fail(
      recordingId,
      !m.ok ? "below-threshold" : "anchors<1",
      asrText,
      m.score ?? 0.2
    );
    await safeUnlink(filePath);
    return;
  }

  // Подсчёт повторов
  // 6) Подсчёт повторов (быстрая речь: «…субханаллах субханаллах…»)
  let repeats = 1;
  try {
    // Вариант 1: твой алгоритм
    const rep = countRepeats(normText, variants as any);
    const algCount =
      rep && typeof rep.totalRepeats === "number" ? rep.totalRepeats : 0;

    // Вариант 2 (fallback): макс. число вхождений по шаблонам
    const tight = normText.replace(/\s+/g, "");
    const patterns = new Set<string>();

    // из эталонных текстов
    for (const v of variants) {
      const t = (v.textNorm || "").toLowerCase().trim();
      if (!t) continue;
      patterns.add(t);
      patterns.add(t.replace(/\s+/g, "")); // слитная форма
    }

    // из объединённых якорей
    const anchorsUnion = unionAnchorsFromVariants(variants as any);
    for (const a of anchorsUnion) {
      const p = (a || "").toLowerCase().trim();
      if (!p) continue;
      patterns.add(p);
      patterns.add(p.replace(/\s+/g, ""));
    }

    const occ = (hay: string, needle: string) => {
      if (!needle) return 0;
      let c = 0,
        i = 0;
      while ((i = hay.indexOf(needle, i)) >= 0) {
        c++;
        i += Math.max(needle.length, 1);
      }
      return c;
    };

    let fallbackMax = 0;
    for (const p of patterns) {
      fallbackMax = Math.max(fallbackMax, occ(normText, p), occ(tight, p));
    }

    repeats = Math.max(1, algCount, fallbackMax);
  } catch {
    repeats = 1;
  }
  // -------
  // Кэп по длительности + общий кэп
  const avgMs = userLevel === "BEGINNER" ? AVG_MS_BEGINNER : AVG_MS_ADVANCED;
  const capByDuration = Math.max(1, Math.floor((durationMs || 0) / avgMs));
  repeats = Math.min(repeats, capByDuration, HARD_CAP);

  console.log("[repeats]", repeats);

  // Антидубль-окно (оставляем)
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

  // Фиксация и инкременты
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

    // по конкретному зикру
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

    // dz уже содержит обновлённый count при update, для create — count = repeats
    const newCount = dz.count ?? repeats;
    if (!dz.completed && newCount >= (dz.target ?? target)) {
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
