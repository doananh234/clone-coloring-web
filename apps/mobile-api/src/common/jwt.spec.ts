import { beforeAll, describe, expect, it } from "vitest";
import { signAccessToken, signRefreshToken, verifyAuthToken } from "./jwt";
import { hashPassword, verifyPassword } from "./password";

beforeAll(() => { process.env.JWT_SECRET = "test-secret-at-least-16-chars"; });

describe("jwt", () => {
  it("round-trips an access token", async () => {
    const token = await signAccessToken("user-1", "user");
    const claims = await verifyAuthToken(token, "access");
    expect(claims.sub).toBe("user-1");
    expect(claims.typ).toBe("access");
  });

  it("rejects a refresh token used as access", async () => {
    const token = await signRefreshToken("user-1", "user");
    await expect(verifyAuthToken(token, "access")).rejects.toThrow();
  });
});

describe("password", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("hunter2pw");
    expect(await verifyPassword("hunter2pw", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
