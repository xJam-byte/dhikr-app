import * as fs from "node:fs/promises";
import axios from "axios";
import FormData from "form-data";

export type AsrResult = { text: string; conf: number };

export interface AsrAdapter {
  transcribe(filePath: string): Promise<AsrResult>;
}

export class HttpAsr implements AsrAdapter {
  constructor(private url: string) {}
  async transcribe(filePath: string): Promise<AsrResult> {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", buf, {
      filename: "audio.m4a",
      contentType: "audio/m4a",
    });
    form.append("lang", "auto");

    const res = await axios.post(this.url, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
    });
    return { text: res.data?.text || "", conf: Number(res.data?.conf || 0) };
  }
}

export class MockAsr implements AsrAdapter {
  async transcribe(): Promise<AsrResult> {
    return { text: "", conf: 0.0 };
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
