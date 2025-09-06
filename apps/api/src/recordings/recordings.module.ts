import { Module } from "@nestjs/common";
import { RecordingsController } from "./recordings.controller";
import { RecordingsService } from "./recordings.service";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [RecordingsController],
  providers: [RecordingsService],
})
export class RecordingsModule {}
