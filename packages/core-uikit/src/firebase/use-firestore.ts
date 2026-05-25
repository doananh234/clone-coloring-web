import { useFirebase, useFirebaseOptional } from "./firebase-provider";
import type { Firestore } from "firebase/firestore";

export function useFirestore(): Firestore {
  const { firestore } = useFirebase();
  return firestore;
}

/**
 * Non-throwing variant of useFirestore.
 * Returns null when no FirebaseProvider is present.
 * Used by createCrudPages so REST-only configs don't require FirebaseProvider.
 */
export function useFirestoreOptional(): Firestore | null {
  const ctx = useFirebaseOptional();
  return ctx?.firestore ?? null;
}
