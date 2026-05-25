import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  type Firestore,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";

// --- Types ---

export type FirestoreQueryOptions = {
  collectionPath: string;
  orderByField?: string;
  orderByDirection?: "asc" | "desc";
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  filters?: Record<string, unknown>;
  searchFields?: string[];
  searchTerm?: string;
};

export type FirestorePaginatedResult<T> = {
  data: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

// --- Utilities ---

/**
 * Recursively convert Firestore Timestamp objects to ISO strings.
 * Handles both Timestamp instances (with toDate()) and plain {seconds, nanoseconds} objects.
 */
export function normalizeTimestamps<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Timestamp instance: has toDate() method
    if ("toDate" in obj && typeof obj.toDate === "function") {
      return (obj as unknown as { toDate(): Date }).toDate().toISOString() as unknown as T;
    }

    // Timestamp-like: has seconds and nanoseconds properties (own or via prototype)
    if (typeof obj.seconds === "number" && typeof obj.nanoseconds === "number") {
      return new Date(
        obj.seconds * 1000 + obj.nanoseconds / 1_000_000,
      ).toISOString() as unknown as T;
    }

    // Empty/corrupt object (e.g. unresolved server timestamp) — return null
    if (Object.keys(obj).length === 0 && obj.constructor === Object) {
      return null as unknown as T;
    }

    // Regular object — recurse
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = normalizeTimestamps(value);
    }
    return result as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => normalizeTimestamps(item)) as unknown as T;
  }

  return data;
}

/**
 * Client-side text filter: returns true if any of the searchFields
 * on the data object contain the searchTerm (case-insensitive).
 */
export function matchesSearch(
  data: Record<string, unknown>,
  searchFields: string[],
  searchTerm: string,
): boolean {
  if (!searchTerm) return true;

  const term = searchTerm.toLowerCase();
  return searchFields.some((field) => {
    const value = data[field];
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(term);
  });
}

// --- CRUD Operations ---

/**
 * Paginated collection fetch with cursor-based pagination,
 * ordering, equality filters, and client-side search.
 */
export async function firestoreGetAll<T>(
  firestore: Firestore,
  options: FirestoreQueryOptions,
): Promise<FirestorePaginatedResult<T>> {
  const {
    collectionPath,
    orderByField = "createdAt",
    orderByDirection = "desc",
    pageSize = 20,
    cursor = null,
    filters = {},
    searchFields = [],
    searchTerm = "",
  } = options;

  const collectionRef = collection(firestore, collectionPath);
  const constraints = [];

  // Apply equality filters (skip "search" key and empty values)
  for (const [key, value] of Object.entries(filters)) {
    if (key === "search" || value === "" || value === null || value === undefined) {
      continue;
    }
    constraints.push(where(key, "==", value));
  }

  constraints.push(orderBy(orderByField, orderByDirection));

  // Over-fetch when client-side search is active
  const fetchLimit = searchTerm ? pageSize * 5 : pageSize + 1;
  constraints.push(limit(fetchLimit));

  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  const q = query(collectionRef, ...constraints);
  const snapshot = await getDocs(q);

  let docs = snapshot.docs.map((d) => ({
    id: d.id,
    ...normalizeTimestamps(d.data()),
    _firestoreDoc: d,
  }));

  // Client-side search filtering
  if (searchTerm && searchFields.length > 0) {
    docs = docs.filter((d) =>
      matchesSearch(d as unknown as Record<string, unknown>, searchFields, searchTerm),
    );
  }

  // Determine hasMore and trim to pageSize
  let hasMore: boolean;
  if (searchTerm) {
    // If we got fewer filtered results than pageSize, might still have more in Firestore
    // but we use the over-fetched count as indicator
    hasMore = snapshot.docs.length === fetchLimit;
  } else {
    hasMore = docs.length > pageSize;
  }

  const trimmed = docs.slice(0, pageSize);
  const lastDoc =
    trimmed.length > 0
      ? (trimmed[trimmed.length - 1]._firestoreDoc as QueryDocumentSnapshot<DocumentData>)
      : null;

  // Remove internal _firestoreDoc from results
  const data = trimmed.map(({ _firestoreDoc: _, ...rest }) => rest) as T[];

  return { data, lastDoc, hasMore };
}

/**
 * Fetch a single document by ID.
 */
export async function firestoreGetOne<T>(
  firestore: Firestore,
  collectionPath: string,
  docId: string,
): Promise<T> {
  const docRef = doc(firestore, collectionPath, docId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    throw new Error(`Document ${collectionPath}/${docId} not found`);
  }

  return {
    id: snapshot.id,
    ...normalizeTimestamps(snapshot.data()),
  } as T;
}

/**
 * Create a new document. Optionally set a custom ID.
 * Auto-adds createdAt and updatedAt server timestamps.
 */
export async function firestoreCreate<T>(
  firestore: Firestore,
  collectionPath: string,
  data: Record<string, unknown>,
  customId?: string,
): Promise<T> {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (customId) {
    const docRef = doc(firestore, collectionPath, customId);
    await setDoc(docRef, payload);
    return { id: customId, ...data } as T;
  }

  const collectionRef = collection(firestore, collectionPath);
  const docRef = await addDoc(collectionRef, payload);
  return { id: docRef.id, ...data } as T;
}

/**
 * Partial update of a document. Auto-adds updatedAt server timestamp.
 */
export async function firestoreUpdate<T>(
  firestore: Firestore,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<T> {
  const docRef = doc(firestore, collectionPath, docId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  return { id: docId, ...data } as T;
}

/**
 * Hard delete a document.
 */
export async function firestoreDelete(
  firestore: Firestore,
  collectionPath: string,
  docId: string,
): Promise<void> {
  const docRef = doc(firestore, collectionPath, docId);
  await deleteDoc(docRef);
}
