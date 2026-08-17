"use client";

import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { resolveImg } from "../../data/img";
import { useSourceCovers } from "../../data/use-source-covers";
import type { SourceCover, TitleSafePosition } from "../../data/source-covers";
import type { BookColoringPage } from "../../data/types";
import { InteriorPickerModal } from "./interior-picker-modal";

const LABEL: Record<TitleSafePosition, string> = { top: "Top", middle: "Middle", bottom: "Bottom" };

export function SourceCoverSection({
  bookId, interiors, sourceCovers, onOpen,
}: {
  bookId: string;
  interiors: BookColoringPage[];
  sourceCovers: SourceCover[];
  onOpen: (sc: SourceCover) => void;
}) {
  const sc = useSourceCovers(bookId);
  const [pickFor, setPickFor] = useState<TitleSafePosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Queue one background job per selected interior page, then close the dialog.
  // Each sc.gen() only enqueues (returns fast) — progress shows in the header
  // queue drawer, so the operator can keep working.
  const doGen = async (interiorPageIds: string[], promptOverride: string) => {
    if (!pickFor || interiorPageIds.length === 0) return;
    setBusy(true); setErr(null);
    try {
      for (const id of interiorPageIds) await sc.gen(id, pickFor, promptOverride);
      setPickFor(null);
    }
    catch (e) { setErr(e instanceof Error ? e.message : "Tạo source cover thất bại"); }
    finally { setBusy(false); }
  };

  // Card accepts `action` (singular) not `actions` — put the 3 Gen buttons there.
  return (
    <Card
      title={`Source Cover · ${sourceCovers.length}`}
      action={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(["top", "middle", "bottom"] as const).map((pos) => (
            <Button key={pos} size="sm" variant="outline" disabled={!sc.enabled || interiors.length === 0}
              onClick={() => { setErr(null); setPickFor(pos); }}>
              <Icon name="image" size={14} /> Gen Cover ({LABEL[pos]})
            </Button>
          ))}
        </div>
      }
    >
      {err && <div style={{ marginBottom: 10, padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}
      {sourceCovers.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Chưa có source cover. Bấm một nút Gen Cover để tạo từ 1 trang interior.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
          {sourceCovers.map((s) => (
            <div key={s.id} onClick={() => onOpen(s)} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImg(s.url)} alt="source cover" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", left: 4, top: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(11,13,12,.6)", padding: "1px 5px", borderRadius: 4 }}>{LABEL[s.titleSafe]}</span>
            </div>
          ))}
        </div>
      )}
      <InteriorPickerModal
        open={pickFor !== null}
        title={`Chọn interior để tạo Source Cover (${pickFor ? LABEL[pickFor] : ""})`}
        titleSafe={pickFor}
        pages={interiors} busy={busy} onConfirm={doGen} onClose={() => setPickFor(null)}
        fetchDefaultPrompt={sc.defaultPrompt}
      />
    </Card>
  );
}
