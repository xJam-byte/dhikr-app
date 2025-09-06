import { Global, Module } from "@nestjs/common";
import { QueuesService } from "./queues.service";
import { RedisModule } from "../redis/redis.module";

@Global()
@Module({
  imports: [RedisModule],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
