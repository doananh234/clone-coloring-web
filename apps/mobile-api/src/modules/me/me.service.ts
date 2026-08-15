import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { parseListQuery, toPage, type Paginated } from "../../common/pagination";
import type { UpdateProfileDto } from "./dto";
import type { CreateColoringDto, UpdateColoringDto } from "./colorings.dto";
import type { Prisma } from "@vx/db";

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

  async listColorings(
    userId: string,
    opts: { status?: string; page?: string; limit?: string },
  ): Promise<Paginated<unknown>> {
    const q = parseListQuery(opts);
    const where: Prisma.UserColoringWhereInput = { userId };
    if (opts.status === "in_progress" || opts.status === "finished") where.status = opts.status;
    const [rows, total] = await Promise.all([
      this.prisma.userColoring.findMany({ where, orderBy: { updatedAt: "desc" }, skip: q.skip, take: q.limit }),
      this.prisma.userColoring.count({ where }),
    ]);
    return toPage(rows, total, q);
  }

  async getColoring(userId: string, id: string) {
    const row = await this.prisma.userColoring.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("Coloring not found");
    return row;
  }

  createColoring(userId: string, dto: CreateColoringDto) {
    return this.prisma.userColoring.create({
      data: {
        userId,
        bookId: dto.bookId,
        pageId: dto.pageId ?? null,
        pageIndex: dto.pageIndex ?? null,
        imageUrl: dto.imageUrl ?? null,
        progress: (dto.progress ?? {}) as Prisma.InputJsonValue,
        status: dto.status ?? "in_progress",
      },
    });
  }

  async updateColoring(userId: string, id: string, dto: UpdateColoringDto) {
    await this.getColoring(userId, id);
    return this.prisma.userColoring.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.progress !== undefined ? { progress: dto.progress as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteColoring(userId: string, id: string): Promise<{ ok: true }> {
    await this.getColoring(userId, id);
    await this.prisma.userColoring.delete({ where: { id } });
    return { ok: true };
  }
}
