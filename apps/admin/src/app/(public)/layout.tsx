"use client";

import { QueryProvider } from "@vx/core-uikit/api";
import { FirebaseProvider } from "@vx/core-uikit/firebase";
import { AuthProvider } from "@vx/auth-module/hooks";
import { firebaseConfig } from "@/firebase-config";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseProvider config={firebaseConfig}>
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </FirebaseProvider>
  );
}
