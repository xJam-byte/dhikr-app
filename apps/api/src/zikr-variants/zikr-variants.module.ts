import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ZikrVariantsService } from "./zikr-variants.service";
import { ZikrVariantsController } from "./zikr-variants.controller";

@Module({
  providers: [ZikrVariantsService, PrismaService],
  controllers: [ZikrVariantsController],
  exports: [ZikrVariantsService],
})
export class ZikrVariantsModule {}
