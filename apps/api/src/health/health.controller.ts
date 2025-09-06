import { Controller, Get } from "@nestjs/common";

@Controller("v1/health")
export class HealthController {
  @Get()
  ping() {
    return { status: "ok", ts: new Date().toISOString() };
  }
}
