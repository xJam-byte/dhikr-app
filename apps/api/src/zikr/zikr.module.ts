import { Module } from "@nestjs/common";
import { ZikrService } from "./zikr.service";
import { ZikrController } from "./zikr.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ZikrVariantsService } from "src/zikr-variants/zikr-variants.service";
import { ZikrVariantsController } from "src/zikr-variants/zikr-variants.controller";

@Module({
  imports: [PrismaModule],
  providers: [ZikrService, ZikrVariantsService],
  controllers: [ZikrController, ZikrVariantsController],
  exports: [ZikrService, ZikrVariantsService],
})
export class ZikrModule {}
