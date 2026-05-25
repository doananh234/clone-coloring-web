import React, { createContext, useContext, useMemo } from "react";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import type { FirebaseConfig } from "./types";

type FirebaseContextValue = {
  app: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({
  config,
  children,
}: {
  config: FirebaseConfig;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const app = initializeApp(config);
    const firestore = getFirestore(app);
    const auth = getAuth(app);
    return { app, firestore, auth };
  }, [config]);

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return ctx;
}

/**
 * Non-throwing variant of useFirebase.
 * Returns null when no FirebaseProvider is present.
 * Used by createCrudPages to avoid requiring FirebaseProvider for REST-only configs.
 */
export function useFirebaseOptional(): FirebaseContextValue | null {
  return useContext(FirebaseContext);
}
