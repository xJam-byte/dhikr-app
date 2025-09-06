import { Module } from "@nestjs/common";
import { CountersService } from "./counters.service";
import { CountersController } from "./counters.controller";
import { RedisModule } from "../redis/redis.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [RedisModule, PrismaModule],
  controllers: [CountersController],
  providers: [CountersService],
})
export class CountersModule {}
