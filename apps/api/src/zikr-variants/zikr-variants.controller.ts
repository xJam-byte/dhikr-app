import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ZikrVariantsService } from "./zikr-variants.service";

@Controller("v1/zikr-variants")
export class ZikrVariantsController {
  constructor(private svc: ZikrVariantsService) {}

  @Post("upsert")
  upsert(@Body("items") items: any[]) {
    return this.svc.upsertMany(items || []);
  }

  @Get(":zikrId")
  byZikr(@Param("zikrId") zikrId: string) {
    return this.svc.listByZikr(zikrId);
  }

  @Get("all")
  all() {
    console.log("Get all zikr variants");

    return this.svc.getAll();
  }
}
