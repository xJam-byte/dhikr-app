"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuesService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const redis_service_1 = require("../redis/redis.service");
let QueuesService = class QueuesService {
    redis;
    processingQueue;
    constructor(redis) {
        this.redis = redis;
        this.processingQueue = new bullmq_1.Queue("processingQueue", {
            connection: this.redis.client,
        });
    }
    enqueueProcessingJob(payload) {
        this.processingQueue.add("process-recording", payload, {
            jobId: payload.recordingId,
            attempts: 2,
            backoff: { type: "fixed", delay: 1500 },
            removeOnComplete: 500,
            removeOnFail: 100,
        });
    }
};
exports.QueuesService = QueuesService;
exports.QueuesService = QueuesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], QueuesService);
//# sourceMappingURL=queues.service.js.map