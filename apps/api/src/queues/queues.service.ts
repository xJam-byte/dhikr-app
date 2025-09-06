import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class QueuesService {
  readonly processingQueue: Queue;

  constructor(private readonly redis: RedisService) {
    this.processingQueue = new Queue("processingQueue", {
      connection: this.redis.client as any,
    });
  }

  enqueueProcessingJob(payload: any) {
    this.processingQueue.add("process-recording", payload, {
      jobId: payload.recordingId, // защита от дублей
      attempts: 2,
      backoff: { type: "fixed", delay: 1500 },
      removeOnComplete: 500,
      removeOnFail: 100,
    });
  }
}
