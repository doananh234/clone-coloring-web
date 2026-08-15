import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
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

  it("rejects a token with the wrong audience", async () => {
    const forged = await new SignJWT({ role: "user", typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setAudience("not-mobile")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    await expect(verifyAuthToken(forged, "access")).rejects.toThrow();
  });

  it("rejects signing when the secret is too short", async () => {
    const valid = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "short";
    try {
      await expect(signAccessToken("u", "user")).rejects.toThrow();
    } finally {
      process.env.JWT_SECRET = valid;
    }
  });
});

describe("password", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("hunter2pw");
    expect(await verifyPassword("hunter2pw", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
