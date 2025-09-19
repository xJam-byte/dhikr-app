import { Injectable } from "@nestjs/common";

/**
 * Единая точка доступа к конфигам из ENV.
 * Без зависимости от @nestjs/config — читаем напрямую process.env,
 * но даём типизированные геттеры и дефолты.
 */
@Injectable()
export class ConfigService {
  private num(key: string, def: number): number {
    const raw = process.env[key];
    const val = Number(raw);
    return Number.isFinite(val) ? val : def;
  }

  private str<K extends string>(key: K, def: string = ""): string {
    const v = process.env[key];
    return (v ?? def).trim();
  }

  // ── Базовое окружение ──────────────────────────────────────────────────────
  get nodeEnv() {
    return this.str("NODE_ENV", "development");
  }
  get isProd() {
    return this.nodeEnv === "production";
  }

  // ── Redis / Queues ─────────────────────────────────────────────────────────
  get redisUrl() {
    return this.str("REDIS_URL", "redis://127.0.0.1:6379");
  }
  get workerConcurrency() {
    return this.num("WORKER_CONCURRENCY", 2);
  }
  get matchPreferredScript() {
    return this.str("MATCH_PREFERRED_SCRIPT", "LATIN").toUpperCase();
  } // "LATIN" | "AR"

  // ── ASR hints (для python-сервиса; прокидываются из воркера) ───────────────
  get asrVadMinSilMs() {
    return this.num("ASR_VAD_MIN_SIL_MS", 140);
  }

  // ── Пороги уверенности ASR (лат/араб) ──────────────────────────────────────
  get minConfLatin() {
    return this.num("MIN_CONF_LATIN", 0.4);
  }
  get minConfAr() {
    return this.num("MIN_CONF_AR", 0.24);
  }

  // ── Подсчёт повторов (repeat-counter) ──────────────────────────────────────
  get minRepeatDurationMs() {
    return this.num("MIN_REPEAT_DURATION_MS", 750);
  } // минимальная длительность повтора
  get minGapBetweenRepeatsMs() {
    return this.num("MIN_GAP_BETWEEN_REPEATS_MS", 300);
  } // зазор между повторами
  get maxWordSkip() {
    return this.num("MAX_WORD_SKIP", 1);
  } // допустимые «мусорные» слова внутри
  get minAvgWordProb() {
    return this.num("MIN_AVG_WORD_PROB", 0.35);
  } // средняя вероятность слов

  // ── Прочее ─────────────────────────────────────────────────────────────────
  get hardCapRepeats() {
    return this.num("HARD_CAP", 5);
  } // верхний жёсткий кэп на повторы
  get duplicateWindowMs() {
    return this.num("DUP_MS", 2500);
  } // окно анти-дублей по processedAt
  get minRecordingMs() {
    return this.num("MIN_MS", 350);
  } // минимальная длина записи
}
