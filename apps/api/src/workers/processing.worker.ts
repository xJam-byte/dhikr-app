// apps/api/src/workers/processing.worker.ts
import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createAsr } from "../verify/asr";
import { normalizeText, buildVariantRegex } from "../verify/text-utils";
import { matchScore } from "../verify/matcher";
import * as RepeatCounter from "../verify/repeat-counter";
import { ConfigService } from "../config/config.service";

// ✅ единый клиент DTW
import { dtwCount, hasLocalTemplates } from "../verify/dtw-aligner";

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

// где лежат аудио-шаблоны
const TEMPLATES_ROOT_ABS =
  process.env.TEMPLATES_ROOT_ABS ||
  path.resolve(__dirname, "..", "assets", "zikr_templates");

// concurrency
const RAW_CONC = Number((cfg.workerConcurrency as any) ?? NaN);
const WORKER_CONCURRENCY =
  Number.isFinite(RAW_CONC) && RAW_CONC > 0 ? Math.floor(RAW_CONC) : 2;
console.log("[worker] concurrency =", WORKER_CONCURRENCY);

// thresholds
const MIN_MS = Number.isFinite(Number(cfg.minRecordingMs))
  ? Number(cfg.minRecordingMs)
  : 350;
const DUP_MS = Number.isFinite(Number(cfg.duplicateWindowMs))
  ? Number(cfg.duplicateWindowMs)
  : 2500;
const MIN_ASR_LEN = 2;

const MIN_CONF_LATIN = Number.isFinite(Number(cfg.minConfLatin))
  ? Number(cfg.minConfLatin)
  : 0.4;
const MIN_CONF_AR = Number.isFinite(Number(cfg.minConfAr))
  ? Number(cfg.minConfAr)
  : 0.28;

const HARD_CAP = Number.isFinite(Number(cfg.hardCapRepeats))
  ? Number(cfg.hardCapRepeats)
  : 5;

const ASR_VAD_MIN_SIL_MS = Number.isFinite(Number(cfg.asrVadMinSilMs))
  ? Number(cfg.asrVadMinSilMs)
  : 180;

const DEFAULT_PREFERRED_SCRIPT =
  (cfg.matchPreferredScript as "LATIN" | "AR") || "LATIN";

type JobData = {
  recordingId: string;
  userId: string;
  zikrId: string;
  filePath: string | null | undefined; // обязателен
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
  try {
    await prisma.recording.update({
      where: { id },
      data: { status: "FAILED", processedAt: new Date(), text, score },
    });
  } catch (e) {
    console.error("[FAIL.update.error]", (e as Error).message);
  }
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
      i = pos + needle.length;
    }
    return c;
  };
  const a = countNonOverlap(haySpaced, needleSpaced);
  const b = countNonOverlap(hayTight, needleTight);
  return Math.max(a, b);
}
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
function countByStrongPatterns(
  text: string,
  variants: Array<{ script: string; textNorm: string; anchors?: string[] }>
): number {
  if (!text) return 0;
  const haySpaced = normalizeText(text);
  const hayTight = haySpaced.replace(/\s+/g, "");
  const hayIsArabic = /[\u0600-\u06FF]/.test(haySpaced);

  type R = { start: number; end: number };
  const collectRanges = (hay: string, needles: string[]): R[] => {
    const out: R[] = [];
    for (const raw of needles) {
      const ndl = normalizeText(raw || "");
      if (!ndl) continue;
      let i = 0;
      while (true) {
        const pos = hay.indexOf(ndl, i);
        if (pos < 0) break;
        out.push({ start: pos, end: pos + ndl.length });
        i = pos + ndl.length;
      }
    }
    return out;
  };
  const strictMerge = (ranges: R[]): R[] => {
    if (ranges.length <= 1) return ranges.slice();
    const items = ranges.slice().sort((a, b) => a.start - b.start);
    const out: R[] = [items[0]];
    for (let i = 1; i < items.length; i++) {
      const prev = out[out.length - 1];
      const cur = items[i];
      if (cur.start < prev.end) prev.end = Math.max(prev.end, cur.end);
      else out.push({ ...cur });
    }
    return out;
  };

  const wantedScript = hayIsArabic ? "AR" : "LATIN";
  const sameScript = variants.filter((v) => (v.script as any) === wantedScript);

  const primaryNeedles = new Set<string>();
  const pushNeedle = (s: string) => {
    const spaced = normalizeText(s);
    if (!spaced) return;
    const tight = spaced.replace(/\s+/g, "");
    primaryNeedles.add(spaced);
    primaryNeedles.add(tight);
    if (!hayIsArabic && /[aiu]$/.test(tight)) {
      primaryNeedles.add(tight.replace(/[aiu]$/, ""));
    }
  };
  for (const v of sameScript) if (v.textNorm) pushNeedle(v.textNorm);

  const coreSpaced = strictMerge(collectRanges(haySpaced, [...primaryNeedles]));
  const coreTight = strictMerge(collectRanges(hayTight, [...primaryNeedles]));
  const coreCount = Math.max(coreSpaced.length, coreTight.length);
  if (coreCount > 0) return coreCount;

  const anchors: string[] = [];
  for (const v of sameScript) {
    for (const a of v.anchors || []) {
      const n = normalizeText(a || "");
      if (n && n.length >= (hayIsArabic ? 2 : 3)) anchors.push(n);
    }
  }
  const synthNeedles = new Set<string>();
  const addSynth = (parts: string[]) => {
    const spaced = parts.join(" ");
    const tight = parts.join("");
    synthNeedles.add(spaced);
    synthNeedles.add(tight);
    if (!hayIsArabic && /[aiu]$/.test(tight)) {
      synthNeedles.add(tight.replace(/[aiu]$/, ""));
    }
  };
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < Math.min(anchors.length, i + 3); j++) {
      addSynth([anchors[i], anchors[j]]);
      if (j + 1 < anchors.length)
        addSynth([anchors[i], anchors[j], anchors[j + 1]]);
    }
  }

  const aSpaced = strictMerge(collectRanges(haySpaced, [...synthNeedles]));
  const aTight = strictMerge(collectRanges(hayTight, [...synthNeedles]));
  return Math.max(aSpaced.length, aTight.length);
}

// ──────────────────────────────────────────────────────────────────────────────

async function processJob(job: JobData) {
  const { recordingId, userId, zikrId, filePath } = job;
  const DURATION_MS = Number.isFinite(Number(job.durationMs))
    ? Number(job.durationMs)
    : 0;

  console.log("[job]", {
    recordingId,
    userId,
    zikrId,
    durationMs: DURATION_MS,
    hasFilePath: !!filePath,
  });

  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "PROCESSING" },
  });

  if (!Number.isFinite(DURATION_MS) || DURATION_MS < MIN_MS) {
    await fail(recordingId, "too-short");
    return;
  }
  if (!filePath) {
    await fail(recordingId, "no-filepath-in-job");
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

  // антидубль окно
  const dupWindow = Number.isFinite(DUP_MS) && DUP_MS > 0 ? DUP_MS : 2500;
  const gteDate = new Date(Date.now() - dupWindow);
  const duplicate = await prisma.recording.findFirst({
    where: { userId, zikrId, status: "DONE", processedAt: { gte: gteDate } },
    select: { id: true },
    orderBy: { processedAt: "desc" },
  });
  if (duplicate) {
    await fail(recordingId, "duplicate-window");
    return;
  }

  // 0) DTW первым
  if (await hasLocalTemplates(TEMPLATES_ROOT_ABS, zikrId)) {
    try {
      const c = await dtwCount(zikrId, filePath);
      console.log("[count.by] dtw =", c);
      if (c >= 1) {
        const repeats = Math.min(c, HARD_CAP);
        await finalizeSuccess(
          repeats,
          recordingId,
          userId,
          zikrId,
          tz,
          "",
          0.95
        );
        await safeUnlink(filePath);
        return;
      }
    } catch (e) {
      console.log("[dtw.error]", (e as Error).message);
    }
  }

  // 1) ASR + фоллбэки по тексту
  const hasARvariant = variants.some((v) => (v.script as any) === "AR");
  const preferAR =
    DEFAULT_PREFERRED_SCRIPT === "AR" ||
    userLevel === "ADVANCED" ||
    user?.language === "ar";
  const langHint = preferAR && hasARvariant ? "ar" : "auto";

  let asrText = "";
  let asrConf = 0;
  let hasAR = false;
  let words: Array<{ w: string; start: number; end: number; p?: number }> = [];
  try {
    const r: any = await (asr as any).transcribe(filePath, {
      lang: langHint,
      vadMinSilMs: ASR_VAD_MIN_SIL_MS,
    });
    asrText = (r.text || "").trim();
    asrConf = Number(r.conf || 0);
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
  const m = matchScore({ asrText, userLevel, variants: variants as any });
  console.log("[match]", m);

  const phraseLatin = pickTopVariantByScript(variants as any, "LATIN");
  const phraseArabic = pickTopVariantByScript(variants as any, "AR");
  const confGate = hasAR ? MIN_CONF_AR : MIN_CONF_LATIN;
  const allowLowConf = m?.ok && (m?.score ?? 0) >= 1.0;

  const durationSec = DURATION_MS / 1000;
  let repeatsNum = 0;

  const exactLatin = countExactPhraseRepeats(asrText, phraseLatin);
  const exactArabic = countExactPhraseRepeats(asrText, phraseArabic);
  const exactBest = Math.max(exactLatin, exactArabic);
  if (exactBest > 0) {
    repeatsNum = exactBest;
    console.log("[count.by] exactPhrase =", repeatsNum);
  } else if (
    words.length > 0 &&
    typeof RepeatCounter.countRepeatsUnified === "function"
  ) {
    const intervals = RepeatCounter.countRepeatsUnified(
      words,
      phraseArabic,
      phraseLatin,
      durationSec
    );
    repeatsNum = intervals.length;
    console.log("[count.by] words =", repeatsNum);
  } else if (normText && normText.length >= MIN_ASR_LEN) {
    repeatsNum = countRepeatsRegex(asrText, phraseArabic, phraseLatin);
    console.log("[count.by] regex =", repeatsNum);
    if (repeatsNum < 1) {
      const r2 = countByStrongPatterns(asrText, variants as any);
      if (r2 > 0) {
        repeatsNum = r2;
        console.log("[count.by] strongPatterns =", repeatsNum);
      }
    }
  }

  if (!Number.isFinite(repeatsNum) || repeatsNum < 1) {
    if ((!Number.isFinite(asrConf) || asrConf < confGate) && !allowLowConf) {
      await fail(recordingId, "no-full-phrase", asrText, m.score ?? 0.2);
      return;
    }
    await fail(recordingId, "no-full-phrase", asrText, m.score ?? 0.2);
    return;
  }

  const minVariantTokens = Math.min(
    ...variants.map((v) => tokenCount(v.textNorm || "") || 1)
  );
  const repeatsCapped = capByDurationTop(
    repeatsNum,
    DURATION_MS,
    hasAR,
    minVariantTokens
  );
  const repeats = Math.min(Number(repeatsCapped), HARD_CAP);

  console.log("[repeats.final]", repeats, hasAR ? "(AR)" : "(LATIN)");

  await finalizeSuccess(
    repeats,
    recordingId,
    userId,
    zikrId,
    tz,
    asrText,
    m.score ?? 0.85
  );
  await safeUnlink(filePath);
}

async function finalizeSuccess(
  repeats: number,
  recordingId: string,
  userId: string,
  zikrId: string,
  tz: string,
  asrText: string,
  score: number
) {
  console.log("[db.tx] start", { repeats, recordingId, userId, zikrId });
  const dayStart = dayStartUtcForTz(new Date(), tz);

  await prisma.$transaction(async (tx) => {
    await tx.recording.update({
      where: { id: recordingId },
      data: {
        status: "DONE",
        processedAt: new Date(),
        text: asrText,
        score,
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

  console.log("[db.tx] done");
}

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
