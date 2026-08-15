import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import type { UpdateProfileDto } from "./dto";

const PUBLIC_SELECT = { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true } as const;

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_SELECT });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.getProfile(userId);
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: PUBLIC_SELECT });
  }
}
