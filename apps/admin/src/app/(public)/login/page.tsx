"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAuthToken } from "@vx/core-uikit/api";
import { Button, Card, CardContent, Input } from "@vx/core-uikit/components";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Đăng nhập thất bại");
        return;
      }
      const { token } = await res.json();
      setAuthToken({ accessToken: token, refreshToken: "" });
      router.push("/");
    } catch {
      setError("Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center text-lg font-semibold">
          VX Admin
        </a>
        <Card>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="text-center">
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-sm text-muted-foreground">Đăng nhập bằng tài khoản của bạn</p>
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium">Tên đăng nhập</label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">Mật khẩu</label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !username || !password}>
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
