// apps/api/src/workers/processing.worker.ts
import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs/promises";
import { createAsr } from "../verify/asr";
import { normalizeText } from "../verify/text-utils";
import { matchScore } from "../verify/matcher";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const prisma = new PrismaClient();
const asr = createAsr();

const QUEUE = "processingQueue";
const JOB = "process-recording";

// базовые пороги
const MIN_MS = 350;
const DUP_MS = 2500;
const MIN_ASR_LEN = 2;

// уверенность ASR
const MIN_CONF_LATIN = Number(process.env.MIN_CONF_LATIN || 0.4);
const MIN_CONF_AR = Number(process.env.MIN_CONF_AR || 0.28);

// верхний жёсткий кэп
const HARD_CAP = 5;

// VAD-хинт для ASR-сервера
const ASR_VAD_MIN_SIL_MS = Number(process.env.ASR_VAD_MIN_SIL_MS || 180);

// предпочтительный скрипт для матчера (на подсчёт повторов не влияет)
const DEFAULT_PREFERRED_SCRIPT = (
  process.env.MATCH_PREFERRED_SCRIPT || "LATIN"
).toUpperCase(); // "LATIN" | "AR"

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

function hasArabicChars(s: string) {
  return /[\u0600-\u06FF]/.test(s || "");
}

function tokenCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

/** берём топ-2 нормализованных фраз по каждому скрипту + tight-варианты */
function buildFullPhrasePatterns(
  variants: Array<{ script: string; textNorm: string; priority: number }>
) {
  const byScript = new Map<string, Array<{ t: string; p: number }>>();
  for (const v of variants) {
    const t = (v.textNorm || "").toLowerCase().trim();
    if (!t) continue;
    const arr = byScript.get(v.script) || [];
    arr.push({ t, p: v.priority || 0 });
    byScript.set(v.script, arr);
  }
  const pickTop2 = (arr: Array<{ t: string; p: number }>) =>
    arr
      .sort((a, b) => b.p - a.p)
      .slice(0, 2)
      .map((x) => x.t);

  const latinBase = pickTop2(byScript.get("LATIN") || []);
  const arBase = pickTop2(byScript.get("AR") || []);

  const tightify = (s: string) => s.replace(/\s+/g, "");
  const latin = new Set<string>();
  const arabic = new Set<string>();

  for (const t of latinBase) {
    latin.add(t);
    latin.add(tightify(t));
  }
  for (const t of arBase) {
    arabic.add(t);
    arabic.add(tightify(t));
  }
  return { latin: Array.from(latin), arabic: Array.from(arabic) };
}

/** строгий подсчёт: неперекрывающиеся вхождения needle в hay (и tight) */
function countNonOverlapping(hay: string, needle: string) {
  if (!hay || !needle) return 0;
  let i = 0;
  let c = 0;
  while (true) {
    const pos = hay.indexOf(needle, i);
    if (pos < 0) break;
    c++;
    i = pos + needle.length;
  }
  return c;
}

function countRepeatsStrict(asrNorm: string, patterns: string[]): number {
  if (!patterns.length) return 0;
  const tight = asrNorm.replace(/\s+/g, "");
  let best = 0;
  for (const p of patterns) {
    const n = p.toLowerCase().trim();
    if (!n) continue;
    const a = countNonOverlapping(asrNorm, n);
    const b = countNonOverlapping(tight, n);
    best = Math.max(best, a, b);
  }
  return best;
}

/** fallback-паттерны из якорей и фраз (фильтруем короткие <5) */
function buildFallbackPatterns(
  variants: Array<{ textNorm: string; anchors: any }>
) {
  const set = new Set<string>();
  for (const v of variants) {
    const t = (v.textNorm || "").toLowerCase().trim();
    if (t && t.length >= 5) {
      set.add(t);
      set.add(t.replace(/\s+/g, ""));
    }
    const aa = (v.anchors || []) as string[];
    for (const a of aa || []) {
      const x = (a || "").toLowerCase().trim();
      if (x.length >= 5) {
        set.add(x);
        set.add(x.replace(/\s+/g, ""));
      }
    }
  }
  return Array.from(set);
}

/** мягкий верхний лимит по длительности (НЕ увеличивает счёт) */
function capByDurationTop(
  repeats: number,
  durationMs: number | null | undefined,
  hasAR: boolean,
  minVariantTokens: number
) {
  if (!durationMs || durationMs < 400) return repeats;
  const perToken = hasAR ? 260 : 300; // арабский чуть быстрее
  const minOneMs = Math.max(
    600,
    150 + perToken * Math.max(1, minVariantTokens)
  );
  const top = Math.max(1, Math.floor(durationMs / minOneMs));
  return Math.min(repeats, top);
}

async function processJob(data: JobData) {
  const { recordingId, userId, zikrId, filePath } = data;
  let { durationMs } = data;

  console.log("[job]", { recordingId, userId, zikrId, durationMs, filePath });

  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "PROCESSING" },
  });

  if (!durationMs || durationMs < MIN_MS) {
    await fail(recordingId, "too-short");
    await safeUnlink(filePath);
    return;
  }

  // эталоны
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

  // хинт для ASR
  const hasARvariant = variants.some((v) => (v.script as any) === "AR");
  const preferAR =
    DEFAULT_PREFERRED_SCRIPT === "AR" ||
    userLevel === "ADVANCED" ||
    user?.language === "ar";
  const langHint = preferAR && hasARvariant ? "ar" : "auto";

  // ASR
  let asrText = "";
  let asrConf = 0;
  let segCount = 0;
  let hasAR = false;
  try {
    const r: any = await (asr as any).transcribe(filePath, {
      lang: langHint,
      vadMinSilMs: ASR_VAD_MIN_SIL_MS,
    });
    asrText = (r.text || "").trim();
    asrConf = r.conf || 0;
    segCount = r.segments_count || 0;
    hasAR = !!r.has_ar || hasArabicChars(asrText);
  } catch (e) {
    console.log("[asr.error]", (e as Error).message);
  }
  console.log("[asr]", {
    text: asrText,
    conf: asrConf,
    langHint,
    has_ar: hasAR,
  });

  const normText = normalizeText(asrText);
  if (!normText || normText.length < MIN_ASR_LEN) {
    await fail(recordingId, "empty-asr", asrText, 0.05);
    await safeUnlink(filePath);
    return;
  }

  // вспомогательный скор (для логов/страховки)
  const m = matchScore({ asrText, userLevel, variants: variants as any });
  console.log("[match]", m);

  // полные фразы
  const { latin: latinPatterns, arabic: arabicPatterns } =
    buildFullPhrasePatterns(variants as any);

  // строгий подсчёт повторов
  let latinRepeats = countRepeatsStrict(normText, latinPatterns);
  let arabicRepeats = countRepeatsStrict(normText, arabicPatterns);
  let repeats = Math.max(latinRepeats, arabicRepeats);

  // ворота по уверенности
  const confGate = hasAR ? MIN_CONF_AR : MIN_CONF_LATIN;
  if (asrConf < confGate) {
    await fail(recordingId, "low-conf", asrText, m.score ?? 0.2);
    await safeUnlink(filePath);
    return;
  }

  // если строгих полных совпадений нет — мягкий fallback по «сильным» паттернам (>=5 символов)
  if (repeats < 1) {
    const fallbackPatterns = buildFallbackPatterns(variants as any);
    const fallbackRepeats = countRepeatsStrict(normText, fallbackPatterns);
    if (fallbackRepeats >= 1 && m.ok) {
      repeats = fallbackRepeats;
      console.log("[fallback] repeats via strong patterns =", repeats);
    } else {
      await fail(recordingId, "no-full-phrase", asrText, m.score ?? 0.2);
      await safeUnlink(filePath);
      return;
    }
  }

  // ограничим сверху длительностью (не увеличиваем!)
  const minVariantTokens = Math.min(
    ...variants.map((v) => tokenCount(v.textNorm || "") || 1)
  );
  repeats = capByDurationTop(repeats, durationMs, hasAR, minVariantTokens);

  // жёсткий кэп
  repeats = Math.min(repeats, HARD_CAP);

  console.log("[repeats]", repeats, hasAR ? "(AR)" : "(LATIN)", {
    latinRepeats,
    arabicRepeats,
    segCount,
  });

  // антидубль-окно
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

  // фиксация и инкременты
  const dayStart = dayStartUtcForTz(new Date(), tz);

  await prisma.$transaction(async (tx) => {
    await tx.recording.update({
      where: { id: recordingId },
      data: {
        status: "DONE",
        processedAt: new Date(),
        text: asrText,
        score: m.score ?? 0.85,
        repeats, // для фронта — показывать +N
      },
    });

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
