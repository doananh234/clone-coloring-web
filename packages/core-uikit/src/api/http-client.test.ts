import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  httpGet,
  httpPost,
  httpPut,
  httpDel,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  setTokenRefreshConfig,
  setUnauthorizedCallback,
  setTokenStorageStrategy,
  setBaseUrl,
} from "./http-client";

describe("http-client", () => {
  beforeEach(() => {
    clearAuthToken();
    setBaseUrl("");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("httpGet sends GET request and returns parsed JSON", async () => {
    const mockData = { id: "1", name: "Test" };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await httpGet<typeof mockData>("/users/1");
    expect(result).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith("/users/1", expect.objectContaining({ method: "GET" }));
  });

  it("httpPost sends POST with JSON body", async () => {
    const body = { name: "New User" };
    const mockResponse = { id: "2", ...body };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await httpPost<typeof mockResponse>("/users", body);
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      "/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("attaches auth header when token is set", async () => {
    setAuthToken({ accessToken: "test-token", refreshToken: "refresh-tok" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await httpGet("/me");
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("clears token on clearAuthToken", () => {
    setAuthToken({ accessToken: "tok", refreshToken: "ref" });
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 }),
    );

    await expect(httpGet("/missing")).rejects.toThrow();
  });
});

describe("token storage strategies", () => {
  beforeEach(() => {
    clearAuthToken();
  });

  afterEach(() => {
    setTokenStorageStrategy("localStorage");
    clearAuthToken();
  });

  it("memory strategy stores tokens only in memory", () => {
    setTokenStorageStrategy("memory");
    setAuthToken({ accessToken: "mem-tok", refreshToken: "mem-ref" });
    expect(getAuthToken()).toEqual({ accessToken: "mem-tok", refreshToken: "mem-ref" });
    expect(localStorage.getItem("vx_auth_tokens")).toBeNull();
  });
});
