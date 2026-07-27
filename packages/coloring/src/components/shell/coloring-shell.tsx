"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header, type HeaderCrumb } from "./header";

const THEME_KEY = "motio-theme";

export interface ColoringShellProps {
  pageTitle: string;
  crumbs?: HeaderCrumb[];
  children: ReactNode;
}

export function ColoringShell({ pageTitle, crumbs, children }: ColoringShellProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  return (
    <div
      className={`motio-theme${theme === "dark" ? " dark" : ""}`}
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {isMobile ? (
        <>
          {navOpen && (
            <div
              onClick={() => setNavOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 60 }}
            />
          )}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 65,
              transform: navOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform var(--dur-med) var(--ease-out)",
            }}
          >
            <Sidebar collapsed={false} onToggleCollapse={() => {}} onNavigate={() => setNavOpen(false)} />
          </div>
        </>
      ) : (
        <div style={{ flexShrink: 0 }}>
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Header
          pageTitle={pageTitle}
          crumbs={crumbs}
          theme={theme}
          onToggleTheme={toggleTheme}
          // Header menu button: mobile → open the drawer; desktop → collapse/expand the sidebar.
          onOpenNav={() => (isMobile ? setNavOpen(true) : setCollapsed((c) => !c))}
        />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            padding: "24px 32px 48px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
