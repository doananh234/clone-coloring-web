import { describe, it, expect } from "vitest";
import { groupUsagesByVariant, type StyleUsage, type UsageVariant } from "./group-style-usages";

const u = (id: string, vId: string | null): StyleUsage => ({
  bookId: `b${id}`, bookTitle: `Book ${id}`, pageId: `p${id}`, coloredUrl: `/c/${id}.png`, coloringVariantId: vId,
});
const variants: UsageVariant[] = [
  { id: "v1", colorPalette: { primaryColors: ["#f00", "#0f0"] } },
  { id: "v2", colorPalette: { primaryColors: ["#00f"] } },
];

describe("groupUsagesByVariant", () => {
  it("groups by variant in variant order, with label + swatches", () => {
    const out = groupUsagesByVariant([u("1", "v2"), u("2", "v1"), u("3", "v1")], variants);
    expect(out.map((g) => [g.variantId, g.label, g.swatches, g.usages.map((x) => x.pageId)])).toEqual([
      ["v1", "Bảng màu 1", ["#f00", "#0f0"], ["p2", "p3"]],
      ["v2", "Bảng màu 2", ["#00f"], ["p1"]],
    ]);
  });

  it("puts null/unknown variantId into one trailing 'Khác' group", () => {
    const out = groupUsagesByVariant([u("1", null), u("2", "vX"), u("3", "v1")], variants);
    expect(out.map((g) => [g.variantId, g.label, g.usages.map((x) => x.pageId)])).toEqual([
      ["v1", "Bảng màu 1", ["p3"]],
      [null, "Khác · không rõ bảng màu", ["p1", "p2"]],
    ]);
  });

  it("omits empty variant groups", () => {
    const out = groupUsagesByVariant([u("1", "v1")], variants);
    expect(out.map((g) => g.variantId)).toEqual(["v1"]);
  });

  it("returns [] for no usages", () => {
    expect(groupUsagesByVariant([], variants)).toEqual([]);
  });

  it("puts everything in 'Khác' when variants is undefined", () => {
    const out = groupUsagesByVariant([u("1", "v1")], undefined);
    expect(out.map((g) => [g.variantId, g.usages.map((x) => x.pageId)])).toEqual([[null, ["p1"]]]);
  });
});
