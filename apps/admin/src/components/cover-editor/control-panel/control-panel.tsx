"use client";
import React from "react";
import { cn } from "@vx/core-uikit/utils";
import { TextPanel } from "./text-panel";
import { StylePanel } from "./style-panel";
import { AiPanel } from "./ai-panel";
import type { SlotName, SlotState } from "../types";
import type { StyleFilter } from "@vx/server-core/text-overlay";

interface ControlPanelProps {
  slots: Record<SlotName, SlotState>;
  onSlotText: (slot: SlotName, text: string) => void;
  onSlotStyle: (slot: SlotName, patch: Partial<Omit<SlotState, "text">>) => void;
  filter: StyleFilter;
  onFilterChange: (f: StyleFilter) => void;
  // AI-generate props: clean illustration + brand name → AI-designed cover.
  bookId: string;
  backgroundImageUrl: string;
  aiCoverUrl: string | null;
  onAiCoverAccept: (url: string) => void;
  // Controlled active tab — lifted to the modal so the canvas can hide text
  // when the AI tab is active.
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

export type Tab = "text" | "style" | "ai";

export function ControlPanel(props: ControlPanelProps) {
  const { tab, onTabChange: setTab } = props;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>Text</TabButton>
        <TabButton active={tab === "style"} onClick={() => setTab("style")}>Style</TabButton>
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>AI</TabButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "text" && (
          <TextPanel
            slots={props.slots}
            onSlotText={props.onSlotText}
            onSlotStyle={props.onSlotStyle}
          />
        )}
        {tab === "style" && (
          <StylePanel filter={props.filter} onFilterChange={props.onFilterChange} />
        )}
        {tab === "ai" && (
          <AiPanel
            bookId={props.bookId}
            backgroundImageUrl={props.backgroundImageUrl}
            defaultBrandName={props.slots.brand.text}
            currentAiCoverUrl={props.aiCoverUrl}
            onAccept={props.onAiCoverAccept}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
