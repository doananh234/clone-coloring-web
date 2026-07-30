import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password helper", () => {
  it("hashes to a non-plaintext bcrypt string", async () => {
    const hash = await hashPassword("s3cret!");
    expect(hash).not.toBe("s3cret!");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret!");
    expect(await verifyPassword("s3cret!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret!");
    expect(await verifyPassword("nope", hash)).toBe(false);
  });
});
