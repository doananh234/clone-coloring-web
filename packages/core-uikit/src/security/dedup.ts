const pendingRequests = new Map<string, Promise<unknown>>();

export function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = requestFn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}
