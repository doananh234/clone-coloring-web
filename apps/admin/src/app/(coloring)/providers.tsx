"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryProvider, setAuthToken, clearAuthToken } from "@vx/core-uikit/api";
import { FirebaseProvider, useFirebase } from "@vx/core-uikit/firebase";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import { ColoringAuthProvider } from "@vx/coloring";
import { firebaseConfig } from "@/firebase-config";

/**
 * Firebase auth gate for the Motio surface: keeps the HTTP client token in sync,
 * redirects to /login when signed out, and supplies { user, logout } to the shell
 * header via ColoringAuthProvider. Mirrors the (dashboard) layout's AuthGate.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const router = useRouter();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const idToken = await user.getIdToken();
        setAuthToken({ accessToken: idToken, refreshToken: "" });
      } else {
        clearAuthToken();
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Firebase ID tokens expire after 1h — refresh every 50 min.
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(async () => {
      const idToken = await firebaseUser.getIdToken(true);
      setAuthToken({ accessToken: idToken, refreshToken: "" });
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [firebaseUser]);

  useEffect(() => {
    if (!isLoading && !firebaseUser) router.replace("/login");
  }, [isLoading, firebaseUser, router]);

  const logout = useCallback(async () => {
    await signOut(auth);
    clearAuthToken();
    router.replace("/login");
  }, [auth, router]);

  if (isLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>Đang tải…</div>;
  }
  if (!firebaseUser) return null;

  const user = {
    name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
    email: firebaseUser.email || "",
    avatar: firebaseUser.photoURL || "",
  };

  return <ColoringAuthProvider value={{ user, logout }}>{children}</ColoringAuthProvider>;
}

/**
 * Providers for the Motio surface. Firebase auth now gates it (same session as
 * the rest of the admin); QueryProvider powers the REST hooks.
 */
export function ColoringProviders({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseProvider config={firebaseConfig}>
      <QueryProvider>
        <AuthGate>{children}</AuthGate>
      </QueryProvider>
    </FirebaseProvider>
  );
}
