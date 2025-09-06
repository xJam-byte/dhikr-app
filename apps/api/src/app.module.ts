import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { QueuesModule } from "./queues/queues.module";
import { UsersModule } from "./users/users.module";
import { ZikrModule } from "./zikr/zikr.module";
import { RecordingsModule } from "./recordings/recordings.module";
import { CountersModule } from "./counters/counters.module";
import { HealthController } from "./health/health.controller";
import { ZikrVariantsController } from './zikr-variants/zikr-variants.controller';
import { ZikrVariantsService } from './zikr-variants/zikr-variants.service';
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    QueuesModule,
    UsersModule,
    ZikrModule,
    RecordingsModule,
    CountersModule,
  ],
  controllers: [HealthController, ZikrVariantsController],
  providers: [ZikrVariantsService],
})
export class AppModule {}
