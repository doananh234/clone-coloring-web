"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryProvider, getAuthToken, clearAuthToken } from "@vx/core-uikit/api";
import { useRouter } from "next/navigation";
import { ColoringAuthProvider, type ColoringUser } from "@vx/coloring";

/**
 * Custom-auth gate for the Motio surface: validates the stored operator JWT via
 * /api/auth/me on mount, redirects to /login when absent/invalid, and supplies
 * { user, logout } to the shell header + sidebar via ColoringAuthProvider.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ColoringUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const token = getAuthToken()?.accessToken;
      if (!token) {
        if (!cancelled) {
          setIsLoading(false);
          router.replace("/login");
        }
        return;
      }
      try {
        const res = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("unauthorized");
        const me = await res.json();
        if (!cancelled) {
          setUser({ name: me.name, email: me.username, username: me.username, role: me.role });
          setIsLoading(false);
        }
      } catch {
        clearAuthToken();
        if (!cancelled) {
          setIsLoading(false);
          router.replace("/login");
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(() => {
    clearAuthToken();
    router.replace("/login");
  }, [router]);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
        Đang tải…
      </div>
    );
  }
  if (!user) return null;

  return <ColoringAuthProvider value={{ user, logout }}>{children}</ColoringAuthProvider>;
}

/**
 * Providers for the Motio surface. Custom operator auth gates it; QueryProvider
 * powers the REST hooks.
 */
export function ColoringProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthGate>{children}</AuthGate>
    </QueryProvider>
  );
}
