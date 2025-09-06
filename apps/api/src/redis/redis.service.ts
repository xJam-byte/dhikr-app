import { Injectable, OnModuleDestroy } from "@nestjs/common";
import IORedis, { Redis } from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  public readonly client: Redis;

  constructor() {
    this.client = new IORedis(
      process.env.REDIS_URL || "redis://127.0.0.1:6379",
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
