import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { MeService } from "./me.service";

describe("MeService colorings", () => {
  it("getColoring throws 404 for another user's row", async () => {
    const prisma = { userColoring: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    const svc = new MeService(prisma);
    await expect(svc.getColoring("u1", "x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("listColorings filters by status when valid", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { userColoring: { findMany, count } } as never;
    const svc = new MeService(prisma);
    await svc.listColorings("u1", { status: "finished" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", status: "finished" } }));
  });
});
