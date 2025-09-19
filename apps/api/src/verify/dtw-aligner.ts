// apps/api/src/verify/dtw-aligner.ts
import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ALIGNER_URL =
  process.env.CTC_ALIGNER_URL ||
  process.env.ALIGNER_CTC_ENDPOINT ||
  "http://127.0.0.1:8091";

export async function hasLocalTemplates(
  templatesRootAbs: string,
  zikrId: string
): Promise<boolean> {
  try {
    const dir = path.join(templatesRootAbs, zikrId);
    const items = await fs.readdir(dir);
    return items.some((n) => /\.(wav|m4a)$/i.test(n));
  } catch {
    return false;
  }
}

/**
 * Простой счёт совпадений (как было).
 */
export async function dtwCount(
  zikrId: string,
  audioPath: string
): Promise<number> {
  const buf = await fs.readFile(audioPath);
  const u8 = new Uint8Array(buf);
  const ext = path.extname(audioPath).toLowerCase();
  const mime =
    ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mpeg" : "audio/mp4";

  const form = new FormData();
  form.append("zikr_id", zikrId);
  form.append("file", new Blob([u8], { type: mime }), path.basename(audioPath));

  const r = await fetch(`${ALIGNER_URL}/dtw_count`, {
    method: "POST",
    body: form,
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`aligner ${r.status}: ${body || r.statusText}`);
  }

  const json: any = await r.json();
  const n = Number(json?.count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Детальные интервалы от аллайнера (если эндпоинт поддерживается).
 * Возвращает массив матчей: { startSec, endSec, score, template? }.
 * Если эндпоинт недоступен — кидает ошибку; используйте try/catch и fallback к dtwCount.
 */
export type DtwInterval = {
  startSec: number;
  endSec: number;
  score: number;
  template?: string;
};

export async function dtwIntervals(
  zikrId: string,
  audioPath: string
): Promise<DtwInterval[]> {
  const buf = await fs.readFile(audioPath);
  const u8 = new Uint8Array(buf);
  const ext = path.extname(audioPath).toLowerCase();
  const mime =
    ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mpeg" : "audio/mp4";

  const form = new FormData();
  form.append("zikr_id", zikrId);
  form.append("file", new Blob([u8], { type: mime }), path.basename(audioPath));

  const r = await fetch(`${ALIGNER_URL}/dtw_intervals`, {
    method: "POST",
    body: form,
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`aligner ${r.status}: ${body || r.statusText}`);
  }

  const json: any = await r.json();
  const items: any[] = Array.isArray(json?.intervals) ? json.intervals : [];

  const out: DtwInterval[] = [];
  for (const it of items) {
    const startSec = Number(it.start ?? it.start_sec ?? it.t0);
    const endSec = Number(it.end ?? it.end_sec ?? it.t1);
    const score = Number(it.score ?? it.dist ?? it.similarity);
    const template = typeof it.template === "string" ? it.template : undefined;
    if (
      Number.isFinite(startSec) &&
      Number.isFinite(endSec) &&
      endSec >= startSec &&
      Number.isFinite(score)
    ) {
      out.push({ startSec, endSec, score, template });
    }
  }

  // на всякий случай отсортируем
  out.sort((a, b) => a.startSec - b.startSec);
  return out;
}
