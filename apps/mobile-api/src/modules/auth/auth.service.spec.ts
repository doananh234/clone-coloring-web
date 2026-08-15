import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { hashPassword } from "../../common/password";

beforeAll(() => { process.env.JWT_SECRET = "test-secret-at-least-16-chars"; });

function makePrisma(user: unknown) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "u1", email: data.email, name: data.name ?? null, avatarUrl: null, role: "user", createdAt: new Date(), passwordHash: data.passwordHash })),
    },
  } as never;
}

describe("AuthService", () => {
  it("register rejects a duplicate email", async () => {
    const svc = new AuthService(makePrisma({ id: "x" }));
    await expect(svc.register({ email: "a@b.co", password: "password1" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("register issues tokens for a new email", async () => {
    const svc = new AuthService(makePrisma(null));
    const res = await svc.register({ email: "a@b.co", password: "password1", name: "Al" });
    expect(res.user.email).toBe("a@b.co");
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect((res.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it("login rejects a wrong password", async () => {
    const hash = await hashPassword("password1");
    const svc = new AuthService(makePrisma({ id: "u1", email: "a@b.co", name: null, avatarUrl: null, role: "user", createdAt: new Date(), passwordHash: hash }));
    await expect(svc.login({ email: "a@b.co", password: "wrong" })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
