export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

export type FirestoreDataSource = {
  type: "firestore";
  collection: string;
  orderBy?: { field: string; direction: "asc" | "desc" };
  searchFields?: string[];
};
