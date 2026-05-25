"use client";

import { SignupForm } from "@vx/auth-module/components";

export default function RegisterPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          VX Admin
        </a>
        <SignupForm />
      </div>
    </div>
  );
}
