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

export async function dtwCount(
  zikrId: string,
  audioPath: string
): Promise<number> {
  const buf = await fs.readFile(audioPath);

  // ❗️Вместо ArrayBuffer используем Uint8Array — тип совместим с BlobPart
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
