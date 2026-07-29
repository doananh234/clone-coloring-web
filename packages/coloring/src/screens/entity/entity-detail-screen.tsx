"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntity, type EntityRecord } from "../../data/use-entity";
import { getEntityPatch } from "../../data/local-entities";
import { useEntityActions } from "../../data/use-entity-actions";
import { useStyleTest, useCategoryIcon } from "../../data/use-more-actions";
import { ColorizeTestModal } from "../../components/ui/colorize-test-modal";
import { humanize, displayFields } from "./entity-fields";
import { StyleResultView } from "./style-result-view";
import { resolveImg } from "../../data/img";

export interface EntityKindConfig {
  path: string;
  title: string;
  /** Where the entity list lives, for the back link. */
  backHref: string;
  backLabel: string;
  imageKeys: string[];
}

export const ENTITY_KINDS: Record<string, EntityKindConfig> = {
  characters: { path: "characters", title: "Nhân vật", backHref: `${B}/library/characters`, backLabel: "Nhân vật", imageKeys: ["referenceImageUrl", "referenceImages.0"] },
  locations: { path: "locations", title: "Bối cảnh", backHref: `${B}/library/locations`, backLabel: "Bối cảnh", imageKeys: ["referenceImageUrl", "referenceImages.0"] },
  "art-styles": { path: "art-styles", title: "B&W style", backHref: `${B}/styles/bwstyles`, backLabel: "B&W style", imageKeys: ["thumbnailUrl", "referenceImages.0"] },
  "coloring-styles": { path: "coloring-styles", title: "Coloring style", backHref: `${B}/styles/colorstyles`, backLabel: "Coloring style", imageKeys: ["thumbnailUrl", "referenceImages.0"] },
  brands: { path: "brands", title: "Brand", backHref: `${B}/library/brands`, backLabel: "Brand", imageKeys: ["logoUrl"] },
  categories: { path: "categories", title: "Danh mục", backHref: `${B}/library/categories`, backLabel: "Danh mục", imageKeys: ["thumbnailUrl"] },
};

function pickImage(obj: EntityRecord, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((a, p) => (a == null ? a : (a as Record<string, unknown>)[p]), obj);
    if (typeof v === "string" && v) return resolveImg(v);
  }
  return undefined;
}

export function EntityDetailScreen({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const cfg = ENTITY_KINDS[kind];
  const { entity, isLoading, isError } = useEntity(cfg?.path ?? "", id);
  const acts = useEntityActions(cfg?.path ?? "", id);
  const isStyle = kind === "art-styles" || kind === "coloring-styles";
  const styleTest = useStyleTest(isStyle ? (kind as "art-styles" | "coloring-styles") : "art-styles");
  const catIcon = useCategoryIcon();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const run = (key: string, fn: () => Promise<void>, opts?: { confirm?: string; onDone?: () => void; ok?: string }) => async () => {
    if (opts?.confirm && !window.confirm(opts.confirm)) return;
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (opts?.ok) setMsg({ ok: opts.ok });
      opts?.onDone?.();
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : "Thất bại" });
    } finally {
      setBusy(null);
    }
  };
  const canRegenRef = kind === "characters" || kind === "locations";

  if (!cfg) return <Card><ErrorState sub={`Loại entity không hợp lệ: ${kind}`} /></Card>;
  if (isLoading) return <Card><LoadingRows rows={6} /></Card>;
  if (isError || !entity) {
    return (
      <Card>
        <ErrorState sub={`Không tải được ${cfg.title.toLowerCase()} ${id}.`} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outline" size="sm" onClick={() => router.push(cfg.backHref)}>Về {cfg.backLabel}</Button>
        </div>
      </Card>
    );
  }

  const name = (entity.displayName as string) || (entity.name as string) || id.slice(0, 8);
  const description = entity.description as string | undefined;
  const tags = Array.isArray(entity.tags) ? (entity.tags as string[]) : [];
  const image = pickImage(entity, cfg.imageKeys);
  const fields = displayFields(entity);
  const type = entity.type as string | undefined;
  const role = entity.role as string | undefined;
  const edited = Boolean(getEntityPatch(kind, id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" onClick={() => router.push(cfg.backHref)}>
          <Icon name="arrow-left" size={16} /> {cfg.backLabel}
        </Button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {edited && <Badge tone="warning">Đã sửa · local</Badge>}
          <Button variant="outline" size="sm" onClick={() => router.push(`${B}/entity/${kind}/${id}/edit`)}>
            <Icon name="pen-line" size={16} /> Sửa
          </Button>
          {canRegenRef && (
            <Button variant="outline" size="sm" disabled={!acts.enabled || busy !== null} title={acts.enabled ? undefined : "Cần bật ghi thật (staging)"} onClick={run("regen", () => acts.regenerateReference(), { ok: "Đã regen hình" })}>
              <Icon name="sparkles" size={16} /> {busy === "regen" ? "Đang tạo…" : "Regen hình mới"}
            </Button>
          )}
          {isStyle && (
            <Button variant="outline" size="sm" disabled={!styleTest.enabled || busy !== null} title={styleTest.enabled ? undefined : "Cần bật ghi thật (staging)"}
              onClick={kind === "coloring-styles"
                ? () => setTestOpen(true)
                : run("test", async () => {
                    const directive = (entity.generationDirective as string) || "";
                    const refs = Array.isArray(entity.referenceImages) ? (entity.referenceImages as { url?: string }[]).map((r) => r.url).filter(Boolean) as string[] : [];
                    const prompt = window.prompt("Prompt test (mô tả trang muốn vẽ):", "a cute cat playing") || "";
                    if (!prompt) return;
                    const url = await styleTest.test({ prompt, generationDirective: directive, referenceImageUrls: refs });
                    if (url) window.open(url, "_blank");
                  }, { ok: "Đã tạo ảnh test (mở tab mới)" })}>
              <Icon name={kind === "coloring-styles" ? "palette" : "wand"} size={16} /> {busy === "test" ? "Đang test…" : kind === "coloring-styles" ? "Test tô màu" : "Test style"}
            </Button>
          )}
          {kind === "categories" && (
            <Button variant="outline" size="sm" disabled={!catIcon.enabled || busy !== null} title={catIcon.enabled ? undefined : "Cần bật ghi thật (staging)"}
              onClick={run("icon", async () => {
                const prompt = window.prompt("Mô tả icon danh mục:", (entity.name as string) || "") || "";
                if (!prompt) return;
                await catIcon.generate(id, prompt);
              }, { ok: "Đã tạo icon" })}>
              <Icon name="sparkles" size={16} /> {busy === "icon" ? "Đang tạo…" : "Tạo icon AI"}
            </Button>
          )}
          <Button variant="danger" size="sm" disabled={!acts.enabled || busy !== null} title={acts.enabled ? undefined : "Cần bật ghi thật (staging)"} onClick={run("del", () => acts.remove(), { confirm: `Xóa "${(entity.displayName as string) || (entity.name as string) || id}"?`, onDone: () => router.push(cfg.backHref) })}>
            <Icon name="x" size={16} /> Xóa
          </Button>
        </div>
      </div>
      {msg && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: msg.err ? "var(--danger-bg)" : "var(--success-bg)", color: msg.err ? "var(--danger)" : "var(--success)" }}>{msg.err || msg.ok}</div>
      )}
      {!acts.enabled && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Regen hình / Xóa chỉ chạy khi bật ghi thật (staging).</div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 150, aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", flexShrink: 0 }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Icon name="image" size={26} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)" }}>{cfg.title}</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{name}</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {role && <Badge tone="carbon">{role}</Badge>}
            {type && <Badge tone="neutral">{type}</Badge>}
            {tags.map((t, i) => <Badge tone="neutral" key={i}>{t}</Badge>)}
          </div>
          {description && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{description}</p>}
        </div>
      </div>

      {isStyle ? (
        <Card title="Chi tiết style">
          <StyleResultView data={entity} omit={["description", "tags", "type", "role"]} />
        </Card>
      ) : (
        fields.length > 0 && (
          <Card title="Chi tiết">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {fields.map((f) => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", marginBottom: 6 }}>
                    {humanize(f.key)}
                  </div>
                  {Array.isArray(f.value) ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {f.value.map((v, i) => <Badge tone="neutral" key={i}>{v}</Badge>)}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{f.value}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {kind === "coloring-styles" && (() => {
        const refUrls = Array.isArray(entity.referenceImages) ? (entity.referenceImages as { url?: string }[]).map((r) => r.url).filter(Boolean) as string[] : [];
        return (
          <ColorizeTestModal
            open={testOpen}
            onClose={() => setTestOpen(false)}
            styleName={name}
            referenceImages={refUrls.map((u) => resolveImg(u) ?? "").filter(Boolean)}
            referenceImageUrls={refUrls}
            colorizationDirective={(entity.colorizationDirective as string) || ""}
          />
        );
      })()}
    </div>
  );
}
