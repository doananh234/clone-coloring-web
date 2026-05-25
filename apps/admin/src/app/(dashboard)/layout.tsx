"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryProvider } from "@vx/core-uikit/api";
import { FirebaseProvider, useFirebase } from "@vx/core-uikit/firebase";
import { setAuthToken, clearAuthToken } from "@vx/core-uikit/api";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import {
  SidebarInset,
  SidebarProvider,
  AppSidebar,
  SiteHeader,
  TooltipProvider,
  Toaster,
} from "@vx/core-uikit/components";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { GlobalImagePreview } from "@/components/global-image-preview";
import { firebaseConfig } from "@/firebase-config";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setNavigate } from "@/lib/navigate";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const router = useRouter();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setNavigate((path) => router.push(path));
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        // Keep the HTTP client token in sync for API routes
        const idToken = await user.getIdToken();
        setAuthToken({ accessToken: idToken, refreshToken: "" });
      } else {
        clearAuthToken();
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Refresh token periodically (Firebase tokens expire after 1 hour)
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(
      async () => {
        const idToken = await firebaseUser.getIdToken(true);
        setAuthToken({ accessToken: idToken, refreshToken: "" });
      },
      50 * 60 * 1000,
    ); // Refresh every 50 minutes
    return () => clearInterval(interval);
  }, [firebaseUser]);

  useEffect(() => {
    if (!isLoading && !firebaseUser) {
      router.replace("/login");
    }
  }, [isLoading, firebaseUser, router]);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    clearAuthToken();
    router.replace("/login");
  }, [auth, router]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!firebaseUser) return null;

  const user = {
    name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
    email: firebaseUser.email || "",
    avatar: firebaseUser.photoURL || "",
  };

  return (
    <SidebarProvider>
      <AppSidebar LinkComponent={Link} user={user} onLogout={handleLogout} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseProvider config={firebaseConfig}>
      <QueryProvider>
        <TooltipProvider>
          <AuthGate>{children}</AuthGate>
          <Toaster position="top-right" richColors />
          <GlobalImagePreview />
          <ReactQueryDevtools initialIsOpen={false} />
        </TooltipProvider>
      </QueryProvider>
    </FirebaseProvider>
  );
}
