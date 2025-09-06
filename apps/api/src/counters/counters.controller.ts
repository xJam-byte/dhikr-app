import {
  Controller,
  Get,
  Req,
  BadRequestException,
  Post,
  Body,
} from "@nestjs/common";
import { CountersService } from "./counters.service";

@Controller("v1/counters")
export class CountersController {
  constructor(private readonly counters: CountersService) {}

  @Get("today")
  async today(@Req() req: any) {
    const deviceId = req.headers["x-device-id"] as string | undefined;
    if (!deviceId) throw new BadRequestException("Missing X-Device-Id header");
    return this.counters.todayByDevice(deviceId);
  }

  @Get("total")
  async total(@Req() req: any) {
    const deviceId = req.headers["x-device-id"] as string | undefined;
    if (!deviceId) throw new BadRequestException("Missing X-Device-Id header");
    return this.counters.totalByDevice(deviceId);
  }
}
