import { z } from "zod";
import type { FieldConfig } from "./types";

export function buildSchemaFromFields(
  fields: FieldConfig[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    if (field.showInForm === false) continue;

    if (field.validation) {
      shape[field.name] = field.validation;
      continue;
    }

    switch (field.type) {
      case "email":
        shape[field.name] = z.string().email();
        break;
      case "number":
        shape[field.name] = z.number();
        break;
      case "boolean":
        shape[field.name] = z.boolean();
        break;
      case "date":
        shape[field.name] = z.string();
        break;
      case "select":
      case "relation":
        shape[field.name] = z.string();
        break;
      case "url-image":
        shape[field.name] = z.string().url().optional();
        break;
      case "color":
        shape[field.name] = z.string().optional();
        break;
      case "nested-array":
        if (field.subFields) {
          const subShape: Record<string, z.ZodTypeAny> = {};
          for (const sub of field.subFields) {
            subShape[sub.name] =
              sub.type === "boolean" ? z.boolean().optional() : z.string().optional();
          }
          shape[field.name] = z.array(z.object(subShape)).optional();
        } else {
          shape[field.name] = z.array(z.unknown()).optional();
        }
        break;
      case "embedded-object":
        if (field.subFields) {
          const objShape: Record<string, z.ZodTypeAny> = {};
          for (const sub of field.subFields) {
            switch (sub.type) {
              case "number":
                objShape[sub.name] = z.number().optional();
                break;
              default:
                objShape[sub.name] = z.string().optional();
            }
          }
          shape[field.name] = z.object(objShape).optional();
        } else {
          shape[field.name] = z.record(z.string(), z.unknown()).optional();
        }
        break;
      case "text":
      case "textarea":
      default:
        shape[field.name] = z.string().min(1);
        break;
    }
  }

  return z.object(shape);
}
