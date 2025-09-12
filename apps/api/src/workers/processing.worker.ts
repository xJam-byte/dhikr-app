// apps/api/src/workers/processing.worker.ts
import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs/promises";
import { createAsr } from "../verify/asr";
import { normalizeText, buildVariantRegex } from "../verify/text-utils";
import { matchScore } from "../verify/matcher";
import * as RepeatCounter from "../verify/repeat-counter";
import { ConfigService } from "../config/config.service";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const cfg = new ConfigService();

const REDIS_URL = cfg.redisUrl;
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const prisma = new PrismaClient();
const asr = createAsr();

const QUEUE = "processingQueue";
const JOB = "process-recording";

// concurrency с защитой
const RAW_CONC = Number((cfg.workerConcurrency as any) ?? NaN);
const WORKER_CONCURRENCY =
  Number.isFinite(RAW_CONC) && RAW_CONC > 0 ? Math.floor(RAW_CONC) : 2;
console.log(
  "[worker] concurrency =",
  WORKER_CONCURRENCY,
  "env:",
  process.env.WORKER_CONCURRENCY
);

// базовые пороги (жёстко приводим к number)
const MIN_MS = Number.isFinite(Number(cfg.minRecordingMs))
  ? Number(cfg.minRecordingMs)
  : 350;
const DUP_MS = Number.isFinite(Number(cfg.duplicateWindowMs))
  ? Number(cfg.duplicateWindowMs)
  : 2500;
const MIN_ASR_LEN = 2;

// уверенность ASR
const MIN_CONF_LATIN = Number.isFinite(Number(cfg.minConfLatin))
  ? Number(cfg.minConfLatin)
  : 0.4;
const MIN_CONF_AR = Number.isFinite(Number(cfg.minConfAr))
  ? Number(cfg.minConfAr)
  : 0.28;

// верхний жёсткий кэп
const HARD_CAP = Number.isFinite(Number(cfg.hardCapRepeats))
  ? Number(cfg.hardCapRepeats)
  : 5;

// VAD-хинт для ASR-сервера
const ASR_VAD_MIN_SIL_MS = Number.isFinite(Number(cfg.asrVadMinSilMs))
  ? Number(cfg.asrVadMinSilMs)
  : 180;

// предпочтительный скрипт
const DEFAULT_PREFERRED_SCRIPT =
  (cfg.matchPreferredScript as "LATIN" | "AR") || "LATIN";

// ──────────────────────────────────────────────────────────────────────────────

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

function pickTopVariantByScript<
  T extends { script: string; textNorm: string; priority?: number }
>(variants: T[], script: "AR" | "LATIN"): string | undefined {
  const pool = variants
    .filter((v) => (v.script as any) === script)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const top = pool[0];
  const t = (top?.textNorm || "").trim();
  return t || undefined;
}

/** мягкий верхний лимит по длительности (НЕ увеличивает счёт) */
function capByDurationTop(
  repeats: number,
  durationMs: number | null | undefined,
  hasAR: boolean,
  minVariantTokens: number
) {
  const repN = Number(repeats);
  const dMs = Number(durationMs);
  if (!Number.isFinite(dMs) || dMs < 400) return repN;

  const perToken = hasAR ? 260 : 300;
  const tokens = Math.max(
    1,
    Number.isFinite(minVariantTokens) ? minVariantTokens : 1
  );
  const minOneMs = Math.max(600, 150 + perToken * tokens);
  const top = Math.max(1, Math.floor(dMs / minOneMs));
  return Math.min(repN, top);
}

/** Точный подсчёт повторов полной фразы (и для spaced, и для tight) */
function countExactPhraseRepeats(text: string, phrase?: string): number {
  if (!phrase) return 0;
  const haySpaced = normalizeText(text || "");
  if (!haySpaced) return 0;

  const needleSpaced = normalizeText(phrase);
  if (!needleSpaced) return 0;

  const hayTight = haySpaced.replace(/\s+/g, "");
  const needleTight = needleSpaced.replace(/\s+/g, "");

  const countNonOverlap = (hay: string, needle: string) => {
    if (!hay || !needle) return 0;
    let i = 0,
      c = 0;
    while (true) {
      const pos = hay.indexOf(needle, i);
      if (pos < 0) break;
      c++;
      i = pos + needle.length; // неперекрывающиеся (важно для back-to-back)
    }
    return c;
  };

  const a = countNonOverlap(haySpaced, needleSpaced);
  const b = countNonOverlap(hayTight, needleTight);
  return Math.max(a, b);
}

/** Fallback: подсчёт по regex с фразами */
function countRepeatsRegex(
  text: string,
  phraseArabic?: string,
  phraseLatin?: string
) {
  const t = normalizeText(text);
  if (!t) return 0;

  const ranges: Array<{ start: number; end: number }> = [];

  function collect(re: RegExp) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const full = m[0];
      const end = re.lastIndex;
      const start = end - full.length;
      ranges.push({ start, end });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  if (phraseArabic)
    collect(buildVariantRegex(normalizeText(phraseArabic), "AR"));
  if (phraseLatin)
    collect(buildVariantRegex(normalizeText(phraseLatin), "LATIN"));

  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) merged.push({ ...r });
    else last.end = Math.max(last.end, r.end);
  }
  return merged.length;
}

function strongPatternsFromVariants(
  variants: Array<{ textNorm: string; anchors?: string[] }>
): string[] {
  const set = new Set<string>();

  const push = (s: string) => {
    const t = normalizeText(s || "");
    if (!t) return;
    set.add(t);
    set.add(t.replace(/\s+/g, "")); // tight
  };

  for (const v of variants) {
    if (v.textNorm) push(v.textNorm);
    for (const a of v.anchors || []) {
      const n = normalizeText(a || "");
      if (n.length >= 3) push(n); // опущен порог до 3 — важные AR токены
    }
  }

  return Array.from(set);
}

/** Подсчёт по сильным паттернам (см. обсуждение) */
function countByStrongPatterns(text: string, patterns: string[]): number {
  if (!text || patterns.length === 0) return 0;

  const spaced = normalizeText(text);
  const tight = spaced.replace(/\s+/g, "");

  const splitTokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
  const normPatterns = patterns.map((p) => normalizeText(p)).filter(Boolean);
  const multi = normPatterns.filter((p) => splitTokens(p).length >= 2);
  const single = normPatterns.filter((p) => splitTokens(p).length === 1);

  const countForHay = (hay: string): number => {
    if (!hay) return 0;
    type R = { start: number; end: number };
    const collect = (needle: string): R[] => {
      const out: R[] = [];
      let i = 0;
      while (true) {
        const pos = hay.indexOf(needle, i);
        if (pos < 0) break;
        const start = pos;
        const end = pos + needle.length;
        out.push({ start, end });
        i = end; // неперекрывающиеся
      }
      return out;
    };

    const gapTol = 1;
    let ranges: R[] = [];
    for (const p of multi) ranges.push(...collect(p));
    if (ranges.length) {
      ranges.sort((a, b) => a.start - b.start);
      const merged: R[] = [ranges[0]];
      for (let i = 1; i < ranges.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = ranges[i];
        const gap = cur.start - prev.end;
        if ((gap >= 0 && gap <= gapTol) || cur.start < prev.end) {
          prev.end = Math.max(prev.end, cur.end);
        } else {
          merged.push({ ...cur });
        }
      }
      ranges = merged;
    }

    // одиночные считаем как отдельные неперекрывающиеся вхождения (без кластеризации),
    // но игнорируем те, что попали внутрь уже найденных multi
    const inside = (pos: number) =>
      ranges.some((r) => pos >= r.start && pos <= r.end);

    let singles: R[] = [];
    for (const p of single) singles.push(...collect(p));
    singles.sort((a, b) => a.start - b.start);
    singles = singles.filter((s) => !inside(s.start) && !inside(s.end));

    ranges.push(...singles);

    if (!ranges.length) return 0;
    ranges.sort((a, b) => a.start - b.start);
    const final: R[] = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const prev = final[final.length - 1];
      const cur = ranges[i];
      if (cur.start < prev.end) prev.end = Math.max(prev.end, cur.end);
      else final.push({ ...cur });
    }
    return final.length;
  };

  const cSpaced = countForHay(spaced);
  const cTight = countForHay(tight);
  const best = Math.max(cSpaced, cTight);
  console.log("[strongPatterns.counts]", {
    spaced: cSpaced,
    tight: cTight,
    best,
  });
  return best;
}

async function processJob(data: JobData) {
  const { recordingId, userId, zikrId, filePath } = data;
  let { durationMs } = data;

  const DURATION_MS = Number.isFinite(Number(durationMs))
    ? Number(durationMs)
    : 0;
  console.log("[job]", {
    recordingId,
    userId,
    zikrId,
    durationMs: DURATION_MS,
    filePath,
  });

  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "PROCESSING" },
  });

  if (!Number.isFinite(DURATION_MS) || DURATION_MS < MIN_MS) {
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
  let words: Array<{ w: string; start: number; end: number; p?: number }> = [];
  try {
    const r: any = await (asr as any).transcribe(filePath, {
      lang: langHint,
      vadMinSilMs: ASR_VAD_MIN_SIL_MS,
    });
    asrText = (r.text || "").trim();
    asrConf = Number(r.conf || 0);
    segCount = Number(r.segments_count || 0);
    hasAR = !!r.has_ar || hasArabicChars(asrText);
    words = Array.isArray(r.words) ? r.words : [];
  } catch (e) {
    console.log("[asr.error]", (e as Error).message);
  }
  console.log("[asr]", {
    text: asrText,
    conf: asrConf,
    langHint,
    has_ar: hasAR,
    words: words.length,
  });

  const normText = normalizeText(asrText);
  if (!normText || normText.length < MIN_ASR_LEN) {
    await fail(recordingId, "empty-asr", asrText, 0.05);
    await safeUnlink(filePath);
    return;
  }

  // вспомогательный скор
  const m = matchScore({ asrText, userLevel, variants: variants as any });
  console.log("[match]", m);

  // Выбираем топ-1 фразу по приоритету для каждого скрипта
  const phraseLatin = pickTopVariantByScript(variants as any, "LATIN");
  const phraseArabic = pickTopVariantByScript(variants as any, "AR");

  // ворота по уверенности (с мягким override)
  const confGate = hasAR ? MIN_CONF_AR : MIN_CONF_LATIN;
  const allowLowConf = m?.ok && (m?.score ?? 0) >= 1.0;
  if ((!Number.isFinite(asrConf) || asrConf < confGate) && !allowLowConf) {
    await fail(recordingId, "low-conf", asrText, m.score ?? 0.2);
    await safeUnlink(filePath);
    return;
  }
  if (allowLowConf && asrConf < confGate) {
    console.log(
      "[low-conf override] conf:",
      asrConf,
      "gate:",
      confGate,
      "score:",
      m.score
    );
  }

  // Подсчёт повторов
  const durationSec = DURATION_MS / 1000;

  let repeatsNum = 0;

  // 0) Самый надёжный: точные повторы ПОЛНОЙ фразы (и AR, и LAT) на spaced/tight
  const exactLatin = countExactPhraseRepeats(asrText, phraseLatin);
  const exactArabic = countExactPhraseRepeats(asrText, phraseArabic);
  const exactBest = Math.max(exactLatin, exactArabic);
  if (exactBest > 0) {
    repeatsNum = exactBest;
    console.log("[repeats.exactPhrase]", {
      exactLatin,
      exactArabic,
      exactBest,
    });
  } else if (
    words.length > 0 &&
    typeof RepeatCounter.countRepeatsUnified === "function"
  ) {
    // 1) По словам (если пришли word timestamps)
    const intervals = RepeatCounter.countRepeatsUnified(
      words,
      phraseArabic,
      phraseLatin,
      durationSec
    );
    repeatsNum = intervals.length;
    console.log("[repeats.byWords]", repeatsNum);
  } else {
    // 2) Регексы по фразам
    repeatsNum = countRepeatsRegex(asrText, phraseArabic, phraseLatin);
    console.log("[repeats.regexFallback]", repeatsNum);

    // 3) Сильные паттерны из всех variants (фраза + anchors)
    if (repeatsNum < 1) {
      const strong = strongPatternsFromVariants(variants as any);
      const r2 = countByStrongPatterns(asrText, strong);
      if (r2 > 0) {
        repeatsNum = r2;
        console.log("[repeats.strongPatterns]", repeatsNum);
      }
    }
  }

  // если 0, но матч высокий — ещё раз по сильным паттернам
  if (
    (!Number.isFinite(repeatsNum) || repeatsNum < 1) &&
    (m.ok || (m.score ?? 0) > 0.85)
  ) {
    const strong = strongPatternsFromVariants(variants as any);
    const r3 = countByStrongPatterns(asrText, strong);
    if (r3 > (repeatsNum || 0)) {
      repeatsNum = r3;
      console.log("[fallback.strongRetry]", repeatsNum);
    }
  }

  if (!Number.isFinite(repeatsNum) || repeatsNum < 1) {
    await fail(recordingId, "no-full-phrase", asrText, m.score ?? 0.2);
    await safeUnlink(filePath);
    return;
  }

  // ограничим сверху длительностью (не увеличиваем!)
  const minVariantTokens = Math.min(
    ...variants.map((v) => tokenCount(v.textNorm || "") || 1)
  );
  const repeatsCapped = capByDurationTop(
    repeatsNum,
    DURATION_MS,
    hasAR,
    minVariantTokens
  );

  // жёсткий кэп
  const repeats = Math.min(Number(repeatsCapped), HARD_CAP);

  console.log("[repeats.final]", repeats, hasAR ? "(AR)" : "(LATIN)");

  // антидубль-окно
  const dupWindow = Number.isFinite(DUP_MS) && DUP_MS > 0 ? DUP_MS : 2500;
  const gteDate = new Date(Date.now() - dupWindow);

  const duplicate = await prisma.recording.findFirst({
    where: {
      userId,
      zikrId,
      status: "DONE",
      processedAt: { gte: gteDate },
    },
    select: { id: true },
    orderBy: { processedAt: "desc" },
  });
  if (duplicate) {
    await fail(recordingId, "duplicate-window", asrText, m.score ?? 0.8);
    await safeUnlink(filePath);
    return;
  }

  // фиксация и инкременты (атомарно)
  const dayStart = dayStartUtcForTz(new Date(), tz);

  await prisma.$transaction(async (tx) => {
    await tx.recording.update({
      where: { id: recordingId },
      data: {
        status: "DONE",
        processedAt: new Date(),
        text: asrText,
        score: m.score ?? 0.85,
        repeats,
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
  { connection, concurrency: WORKER_CONCURRENCY }
)
  .on("completed", (job) => console.log("✅ worker done", job.id))
  .on("failed", (job, err) => console.error("❌ worker failed", job?.id, err));
