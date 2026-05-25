import { describe, it, expect } from "vitest";
import { buildSchemaFromFields } from "./build-schema-from-fields";
import type { FieldConfig } from "./types";

describe("buildSchemaFromFields", () => {
  it("builds schema for text fields", () => {
    const fields: FieldConfig[] = [
      { name: "name", label: "Name", type: "text" },
      { name: "email", label: "Email", type: "email" },
    ];
    const schema = buildSchemaFromFields(fields);
    const result = schema.safeParse({ name: "John", email: "john@test.com" });
    expect(result.success).toBe(true);
  });

  it("validates email type", () => {
    const fields: FieldConfig[] = [
      { name: "email", label: "Email", type: "email" },
    ];
    const schema = buildSchemaFromFields(fields);
    const result = schema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("validates number type", () => {
    const fields: FieldConfig[] = [
      { name: "age", label: "Age", type: "number" },
    ];
    const schema = buildSchemaFromFields(fields);
    expect(schema.safeParse({ age: 25 }).success).toBe(true);
  });

  it("validates boolean type", () => {
    const fields: FieldConfig[] = [
      { name: "active", label: "Active", type: "boolean" },
    ];
    const schema = buildSchemaFromFields(fields);
    expect(schema.safeParse({ active: true }).success).toBe(true);
  });

  it("only includes fields with showInForm !== false", () => {
    const fields: FieldConfig[] = [
      { name: "name", label: "Name", type: "text" },
      { name: "id", label: "ID", type: "text", showInForm: false },
    ];
    const schema = buildSchemaFromFields(fields);
    expect(schema.safeParse({ name: "John" }).success).toBe(true);
  });
});
