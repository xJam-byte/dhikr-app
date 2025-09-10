import * as fs from "node:fs/promises";
import axios from "axios";
import FormData from "form-data";

export type AsrResult = {
  text: string;
  conf: number;
  lang?: string | null;
  has_ar?: boolean;
  segments_count?: number;
  segments?: string[];
};

export interface AsrAdapter {
  transcribe(
    filePath: string,
    opts?: { lang?: string; vadMinSilMs?: number }
  ): Promise<AsrResult>;
}

export class HttpAsr implements AsrAdapter {
  constructor(private url: string) {}
  async transcribe(
    filePath: string,
    opts?: { lang?: string; vadMinSilMs?: number }
  ): Promise<AsrResult> {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", buf, {
      filename: "audio.m4a",
      contentType: "audio/m4a",
    });
    form.append("lang", opts?.lang ?? "auto");
    if (typeof opts?.vadMinSilMs === "number") {
      form.append("vad_min_sil_ms", String(opts.vadMinSilMs));
    }

    const res = await axios.post(this.url, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
    });

    const d = res.data || {};
    return {
      text: d.text || "",
      conf: Number(d.conf || 0),
      lang: d.lang ?? null,
      has_ar: !!d.has_ar,
      segments_count:
        typeof d.segments_count === "number" ? d.segments_count : undefined,
      segments: Array.isArray(d.segments) ? d.segments : undefined,
    };
  }
}

export class MockAsr implements AsrAdapter {
  async transcribe(): Promise<AsrResult> {
    return {
      text: "",
      conf: 0.0,
      lang: null,
      has_ar: false,
      segments_count: 0,
      segments: [],
    };
  }
}

export function createAsr(): AsrAdapter {
  const provider = process.env.ASR_PROVIDER || "mock";
  if (provider === "http") {
    const url = process.env.ASR_HTTP_URL || "http://127.0.0.1:5005/transcribe";
    return new HttpAsr(url);
  }
  return new MockAsr();
}
