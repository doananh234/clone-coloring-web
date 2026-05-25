import React from "react";
import { useTranslation } from "react-i18next";
import { useForm, type DefaultValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodSchema } from "zod";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../../utils/cn";
import { UrlImageField } from "./url-image-field";
import { ColorField } from "./color-field";
import { NestedArrayField } from "./nested-array-field";
import { EmbeddedObjectField } from "./embedded-object-field";
import type { FieldConfig } from "../../generators/types";

type FieldType =
  | "text"
  | "email"
  | "number"
  | "select"
  | "textarea"
  | "date"
  | "boolean"
  | "password"
  | "url-image"
  | "color"
  | "nested-array"
  | "embedded-object";

type FormField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
  subFields?: FieldConfig[];
  readOnly?: boolean;
};

type FormBuilderProps<T extends Record<string, unknown>> = {
  fields: FormField[];
  schema: ZodSchema<T>;
  defaultValues?: DefaultValues<T>;
  onSubmit: (data: T) => void | Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  className?: string;
  /** Custom field renderer — overrides default field rendering */
  renderField?: (
    field: FormField,
    props: {
      register: ReturnType<typeof useForm>["register"];
      setValue: ReturnType<typeof useForm>["setValue"];
      watch: ReturnType<typeof useForm>["watch"];
      error?: string;
    },
  ) => React.ReactNode;
  /** Custom footer renderer — overrides default submit/cancel buttons */
  renderFooter?: (props: { isLoading: boolean }) => React.ReactNode;
};

function FormBuilderInner<T extends Record<string, unknown>>({
  fields,
  schema,
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel,
  cancelLabel,
  onCancel,
  className,
  renderField,
  renderFooter,
}: FormBuilderProps<T>) {
  const { t } = useTranslation("common");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema as any) as any,
    defaultValues,
  } as any) as any;

  function renderDefaultField(field: FormField) {
    const error = (errors as any)[field.name];
    const errorMessage = error?.message as string | undefined;

    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            {...register(field.name as Path<T>)}
            placeholder={field.placeholder}
            className={cn(errorMessage && "border-destructive")}
          />
        );
      case "select":
        return (
          <Select
            value={watch(field.name as Path<T>) as string}
            onValueChange={(val) =>
              setValue(field.name as Path<T>, val as any, { shouldValidate: true })
            }
          >
            <SelectTrigger className={cn(errorMessage && "border-destructive")}>
              <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={watch(field.name as Path<T>) as boolean}
              onCheckedChange={(checked) =>
                setValue(field.name as Path<T>, checked as any, { shouldValidate: true })
              }
            />
            <span className="text-sm">{field.label}</span>
          </div>
        );
      case "url-image":
        return (
          <UrlImageField
            value={(watch(field.name as Path<T>) as string) ?? ""}
            onChange={(val) =>
              setValue(field.name as Path<T>, val as any, { shouldValidate: true })
            }
            placeholder={field.placeholder}
            error={errorMessage}
          />
        );
      case "color":
        return (
          <ColorField
            value={(watch(field.name as Path<T>) as string) ?? ""}
            onChange={(val) =>
              setValue(field.name as Path<T>, val as any, { shouldValidate: true })
            }
            error={errorMessage}
          />
        );
      case "nested-array":
        return (
          <NestedArrayField
            subFields={field.subFields ?? []}
            value={(watch(field.name as Path<T>) as Record<string, unknown>[]) ?? []}
            onChange={(val) =>
              setValue(field.name as Path<T>, val as any, { shouldValidate: true })
            }
            readOnly={field.readOnly}
          />
        );
      case "embedded-object":
        return (
          <EmbeddedObjectField
            subFields={field.subFields ?? []}
            value={(watch(field.name as Path<T>) as Record<string, unknown>) ?? {}}
            onChange={(val) =>
              setValue(field.name as Path<T>, val as any, { shouldValidate: true })
            }
          />
        );
      default:
        return (
          <Input
            type={field.type}
            {...register(field.name as Path<T>, {
              valueAsNumber: field.type === "number",
            })}
            placeholder={field.placeholder}
            className={cn(errorMessage && "border-destructive")}
          />
        );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className={cn("space-y-4", className)}>
      {fields.map((field) => {
        const error = (errors as any)[field.name];
        const errorMessage = error?.message as string | undefined;

        if (renderField) {
          return (
            <div key={field.name} className="space-y-2">
              {renderField(field, {
                register: register as any,
                setValue: setValue as any,
                watch: watch as any,
                error: errorMessage,
              })}
            </div>
          );
        }

        return (
          <div key={field.name} className="space-y-1.5">
            {field.type !== "boolean" && (
              <Label htmlFor={field.name} className="text-sm font-medium">
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
            )}
            {renderDefaultField(field)}
            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          </div>
        );
      })}
      {renderFooter ? (
        renderFooter({ isLoading: !!isLoading })
      ) : (
        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t("loading") : (submitLabel ?? t("save"))}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelLabel ?? t("cancel")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

export const FormBuilder = React.memo(FormBuilderInner) as typeof FormBuilderInner;
