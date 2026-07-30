// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt";

const claims = { sub: "op1", username: "admin", role: "admin", name: "Boss" };

describe("jwt session helper", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret-please-change";
  });

  it("round-trips claims through sign/verify", async () => {
    const token = await signSessionToken(claims);
    expect(typeof token).toBe("string");
    const decoded = await verifySessionToken(token);
    expect(decoded).toMatchObject(claims);
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(claims);
    await expect(verifySessionToken(token + "x")).rejects.toBeDefined();
  });

  it("rejects when signed with a different secret", async () => {
    const token = await signSessionToken(claims);
    process.env.AUTH_JWT_SECRET = "a-different-secret";
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });
});
