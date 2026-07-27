"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ColoringUser {
  name: string;
  email: string;
  avatar?: string;
}

interface ColoringAuthValue {
  user: ColoringUser | null;
  logout: () => void | Promise<void>;
}

/**
 * Auth context for the Motio shell. The app layer (ColoringProviders) owns the
 * Firebase session and supplies { user, logout }; the header consumes it here so
 * it shows the real signed-in user + a working logout instead of a hardcoded one.
 */
const ColoringAuthContext = createContext<ColoringAuthValue>({ user: null, logout: () => {} });

export function ColoringAuthProvider({ value, children }: { value: ColoringAuthValue; children: ReactNode }) {
  return <ColoringAuthContext.Provider value={value}>{children}</ColoringAuthContext.Provider>;
}

export function useColoringAuth(): ColoringAuthValue {
  return useContext(ColoringAuthContext);
}
