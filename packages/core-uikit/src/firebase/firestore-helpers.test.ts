import { describe, it, expect } from "vitest";
import { normalizeTimestamps, matchesSearch } from "./firestore-helpers";

describe("normalizeTimestamps", () => {
  it("converts Timestamp-like objects to ISO strings", () => {
    const fakeDate = new Date("2024-06-15T10:30:00Z");
    const timestamp = { toDate: () => fakeDate, seconds: 123, nanoseconds: 0 };
    const data = { name: "Test", createdAt: timestamp };

    const result = normalizeTimestamps(data);

    expect(result.createdAt).toBe("2024-06-15T10:30:00.000Z");
    expect(result.name).toBe("Test");
  });

  it("handles arrays with timestamps", () => {
    const fakeDate = new Date("2024-01-01T00:00:00Z");
    const data = [{ toDate: () => fakeDate }, "plain-string", 42];

    const result = normalizeTimestamps(data);

    expect(result[0]).toBe("2024-01-01T00:00:00.000Z");
    expect(result[1]).toBe("plain-string");
    expect(result[2]).toBe(42);
  });

  it("passes through primitives unchanged", () => {
    expect(normalizeTimestamps("hello")).toBe("hello");
    expect(normalizeTimestamps(42)).toBe(42);
    expect(normalizeTimestamps(true)).toBe(true);
    expect(normalizeTimestamps(null)).toBe(null);
    expect(normalizeTimestamps(undefined)).toBe(undefined);
  });

  it("recursively normalizes nested objects", () => {
    const fakeDate = new Date("2024-03-20T12:00:00Z");
    const data = {
      user: {
        name: "Alice",
        lastLogin: { toDate: () => fakeDate },
      },
    };

    const result = normalizeTimestamps(data);

    expect(result.user.lastLogin).toBe("2024-03-20T12:00:00.000Z");
    expect(result.user.name).toBe("Alice");
  });
});

describe("matchesSearch", () => {
  const item = { name: "Harry Potter", author: "J.K. Rowling", price: 29.99 };

  it("returns true when search term matches a field", () => {
    expect(matchesSearch(item, ["name", "author"], "harry")).toBe(true);
    expect(matchesSearch(item, ["name", "author"], "rowling")).toBe(true);
  });

  it("returns false when no field matches", () => {
    expect(matchesSearch(item, ["name", "author"], "narnia")).toBe(false);
  });

  it("returns true for empty search term", () => {
    expect(matchesSearch(item, ["name"], "")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(matchesSearch(item, ["name"], "HARRY")).toBe(true);
    expect(matchesSearch(item, ["author"], "j.k. ROWLING")).toBe(true);
  });

  it("handles null/undefined field values gracefully", () => {
    const data = { name: null, title: undefined, desc: "A book" };
    expect(matchesSearch(data as Record<string, unknown>, ["name", "title", "desc"], "book")).toBe(
      true,
    );
    expect(matchesSearch(data as Record<string, unknown>, ["name", "title"], "anything")).toBe(
      false,
    );
  });
});
