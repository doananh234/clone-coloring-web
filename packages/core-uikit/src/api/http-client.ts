import { runRequestMiddleware, runErrorMiddleware } from "./middleware";
import { deduplicateRequest } from "../security/dedup";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type TokenStorageStrategy = "localStorage" | "cookie" | "memory";

let storageStrategy: TokenStorageStrategy = "localStorage";

export function setTokenStorageStrategy(strategy: TokenStorageStrategy): void {
  storageStrategy = strategy;
}

const TOKEN_KEY = "vx_auth_tokens";

let tokens: AuthTokens | null = null;
let unauthorizedCallback: (() => void) | null = null;
let refreshConfig: { url: string } | null = null;
let isRefreshing = false;
let refreshPromise: Promise<AuthTokens | null> | null = null;

// --- Token Management ---

export function setAuthToken(newTokens: AuthTokens): void {
  tokens = newTokens;
  if (storageStrategy === "localStorage") {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
  } else if (storageStrategy === "cookie") {
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(JSON.stringify(newTokens))}; path=/; SameSite=Strict; Secure; max-age=86400`;
  }
}

export function getAuthToken(): AuthTokens | null {
  if (tokens) return tokens;

  if (storageStrategy === "localStorage") {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      tokens = JSON.parse(stored) as AuthTokens;
      return tokens;
    }
  } else if (storageStrategy === "cookie") {
    const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
    if (match) {
      tokens = JSON.parse(decodeURIComponent(match[1])) as AuthTokens;
      return tokens;
    }
  }

  return null;
}

export function clearAuthToken(): void {
  tokens = null;
  if (storageStrategy === "localStorage") {
    localStorage.removeItem(TOKEN_KEY);
  } else if (storageStrategy === "cookie") {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  }
}

export function setUnauthorizedCallback(cb: () => void): void {
  unauthorizedCallback = cb;
}

export function setTokenRefreshConfig(config: { url: string }): void {
  refreshConfig = config;
}

// --- Internal Helpers ---

let _baseUrl: string | undefined;

export function setBaseUrl(url: string): void {
  _baseUrl = url;
}

function getBaseUrl(): string {
  if (_baseUrl !== undefined) return _baseUrl;
  // Same-origin by default — works for both Vite dev (proxy) and Next.js (API routes)
  return "";
}

function buildHeaders(custom?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...custom,
  };
  const currentTokens = getAuthToken();
  if (currentTokens) {
    headers["Authorization"] = `Bearer ${currentTokens.accessToken}`;
  }
  return headers;
}

async function refreshToken(): Promise<AuthTokens | null> {
  const currentTokens = getAuthToken();
  if (!currentTokens || !refreshConfig) return null;

  try {
    const response = await fetch(`${getBaseUrl()}${refreshConfig.url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentTokens.refreshToken }),
    });
    if (!response.ok) return null;
    const newTokens = (await response.json()) as AuthTokens;
    setAuthToken(newTokens);
    return newTokens;
  } catch {
    return null;
  }
}

async function handleUnauthorized(): Promise<AuthTokens | null> {
  if (isRefreshing) return refreshPromise;

  isRefreshing = true;
  refreshPromise = refreshToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });

  const result = await refreshPromise;
  if (!result) {
    clearAuthToken();
    unauthorizedCallback?.();
  }
  return result;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  options: RequestInit & { _retry?: boolean } = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const reqCtx = await runRequestMiddleware({
    url: `${baseUrl}${url}`,
    method: options.method ?? "GET",
    headers: buildHeaders(options.headers as Record<string, string>),
    body: options.body,
  });
  const response = await fetch(reqCtx.url, {
    ...options,
    headers: reqCtx.headers,
    credentials: storageStrategy === "cookie" ? "include" : "same-origin",
  });

  if (response.status === 401 && !options._retry) {
    const tokenExpired = response.headers.get("X-Token-Expired") === "true";
    if (tokenExpired || refreshConfig) {
      const newTokens = await handleUnauthorized();
      if (newTokens) {
        return request<T>(url, { ...options, _retry: true });
      }
    }
    clearAuthToken();
    unauthorizedCallback?.();
    const apiErr401 = new ApiError(401, "Unauthorized", null);
    runErrorMiddleware(apiErr401);
    throw apiErr401;
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // ignore parse error
    }
    const apiErr = new ApiError(response.status, response.statusText, body);
    runErrorMiddleware(apiErr);
    throw apiErr;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// --- Public API ---

export function httpGet<T>(url: string): Promise<T> {
  return deduplicateRequest(url, () => request<T>(url, { method: "GET" }));
}

export function httpPost<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export function httpPut<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export function httpPatch<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export function httpDel<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, {
    method: "DELETE",
    body: data ? JSON.stringify(data) : undefined,
  });
}
