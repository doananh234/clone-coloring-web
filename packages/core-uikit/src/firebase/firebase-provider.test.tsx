import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { FirebaseProvider, useFirebase } from "./firebase-provider";
import React from "react";

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ name: "[DEFAULT]" })),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ type: "firestore" })),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ type: "auth" })),
}));

const testConfig = {
  apiKey: "test-key",
  authDomain: "test.firebaseapp.com",
  projectId: "test-project",
  appId: "1:123:web:abc",
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <FirebaseProvider config={testConfig}>{children}</FirebaseProvider>;
}

describe("FirebaseProvider", () => {
  it("provides firebase context", () => {
    const { result } = renderHook(() => useFirebase(), { wrapper });
    expect(result.current.app).toBeDefined();
    expect(result.current.firestore).toBeDefined();
    expect(result.current.auth).toBeDefined();
  });

  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useFirebase());
    }).toThrow("useFirebase must be used within a FirebaseProvider");
  });
});
