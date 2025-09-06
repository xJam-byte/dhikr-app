import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: {
    email: string;
    passwordHash: string;
    language?: string;
    level?: "BEGINNER" | "ADVANCED";
    timezone?: string;
  }) {
    return this.prisma.user.create({ data });
  }

  me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  updateMe(userId: string, data: any) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }
}
