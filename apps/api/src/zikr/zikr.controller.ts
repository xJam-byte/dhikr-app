import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Patch,
} from "@nestjs/common";
import { ZikrService } from "./zikr.service";

@Controller("v1/zikr")
export class ZikrController {
  constructor(private zikr: ZikrService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query("q") q?: string,
    @Query("limit") limit = 20,
    @Query("offset") offset = 0
  ) {
    const lang = req.headers["accept-language"] as string | undefined;
    const items = await this.zikr.list(lang, q, Number(limit), Number(offset));
    return {
      items,
      total: items.length,
      limit: Number(limit),
      offset: Number(offset),
    };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.zikr.get(id);
  }

  // 🆕 Добавить один зикр
  @Post()
  async create(@Body() body: any) {
    // body = { arabicText, translit, translations: { ru, kz, en } }
    return this.zikr.create(body);
  }

  // 🆕 Добавить несколько зикров сразу
  @Post("bulk")
  async createBulk(@Body("items") items: any[]) {
    return this.zikr.createBulk(items);
  }
  @Patch("bulk-update")
  bulkUpdate(
    @Body("items")
    items: Array<{
      id: string;
      category?: string | null;
      target?: number | null;
    }>
  ) {
    return this.zikr.bulkUpdate(items);
  }
}
