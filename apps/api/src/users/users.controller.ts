import { Controller, Get, Patch, Body, UseGuards, Req } from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("v1/user")
export class UsersController {
  constructor(private users: UsersService) {}

  @Get("me")
  async me(@Req() req: any) {
    return this.users.me(req.user.id);
  }

  @Patch("me")
  async update(@Req() req: any, @Body() body: any) {
    return this.users.updateMe(req.user.id, body);
  }
}
