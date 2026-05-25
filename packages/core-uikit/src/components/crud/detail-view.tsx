import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";

type DetailField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "date"
    | "boolean"
    | "badge"
    | "url-image"
    | "color"
    | "nested-array"
    | "embedded-object";
  subFields?: { name: string; label: string; type?: string }[];
  render?: (value: unknown) => React.ReactNode;
};

type DetailViewProps = {
  title?: string;
  data: Record<string, unknown>;
  fields: DetailField[];
  actions?: React.ReactNode;
  imageBaseUrl?: string;
};

function resolveImageUrl(url: string | undefined | null, baseUrl?: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (baseUrl) return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

function renderValue(field: DetailField, value: unknown, imageBaseUrl?: string): React.ReactNode {
  if (field.render) return field.render(value);
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (field.type) {
    case "boolean":
      return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
    case "badge":
      return <Badge>{String(value)}</Badge>;
    case "date": {
      if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
      }
      if (typeof value === "number") return new Date(value).toLocaleDateString();
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.toDate === "function")
          return (obj as { toDate(): Date }).toDate().toLocaleDateString();
        if (typeof obj.seconds === "number")
          return new Date(obj.seconds * 1000).toLocaleDateString();
        // Empty/corrupt timestamp
        return <span className="text-muted-foreground">—</span>;
      }
      return String(value);
    }
    case "url-image": {
      const resolved = resolveImageUrl(String(value), imageBaseUrl);
      return resolved ? (
        <div className="flex items-center gap-3">
          <img
            src={resolved}
            alt="Preview"
            className="h-16 w-16 rounded border object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-xs text-muted-foreground break-all max-w-md">{String(value)}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    }
    case "color": {
      const hex = String(value);
      return (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded border" style={{ backgroundColor: hex }} />
          <span className="text-sm">{hex}</span>
        </div>
      );
    }
    case "nested-array": {
      const items = value as Record<string, unknown>[] | undefined;
      if (!items?.length) {
        return <span className="text-muted-foreground">--</span>;
      }
      return (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={idx} className="rounded border px-2 py-1 text-sm">
              {(field.subFields ?? []).map((sub) => (
                <span key={sub.name} className="mr-3">
                  <span className="font-medium">{sub.label}:</span> {String(item[sub.name] ?? "")}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case "embedded-object": {
      const obj = value as Record<string, unknown> | undefined;
      if (!obj) {
        return <span className="text-muted-foreground">--</span>;
      }
      return (
        <div className="space-y-1 text-sm">
          {(field.subFields ?? []).map((sub) => (
            <div key={sub.name}>
              <span className="font-medium">{sub.label}:</span> {String(obj[sub.name] ?? "")}
            </div>
          ))}
        </div>
      );
    }
    default:
      return String(value);
  }
}

export function DetailView({ title, data, fields, actions, imageBaseUrl }: DetailViewProps) {
  return (
    <Card>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-center justify-between">
          {title && <CardTitle>{title}</CardTitle>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent>
        <dl className="space-y-4">
          {fields.map((field, index) => (
            <React.Fragment key={field.name}>
              {index > 0 && <Separator />}
              <div className="grid grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-muted-foreground">{field.label}</dt>
                <dd className="col-span-2 text-sm">
                  {renderValue(field, data[field.name], imageBaseUrl)}
                </dd>
              </div>
            </React.Fragment>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
