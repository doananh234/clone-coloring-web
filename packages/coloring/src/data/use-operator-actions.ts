"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";

export interface CreateOperatorInput {
  username: string;
  name: string;
  password: string;
  role: string;
}

export interface UpdateOperatorPatch {
  name?: string;
  role?: string;
  disabled?: boolean;
}

/** Mutations for admin operator accounts (same-origin /api/operators). */
export function useOperatorActions() {
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setIsPending(true);
    try {
      const result = await fn();
      // Shared query key with both useOperators hooks (aligned to this key).
      await qc.invalidateQueries({ queryKey: ["coloring", "operators"] });
      return result;
    } finally {
      setIsPending(false);
    }
  }

  return {
    isPending,
    create: (input: CreateOperatorInput) => run(() => httpPost("/api/operators", input)),
    update: (id: string, patch: UpdateOperatorPatch) => run(() => httpPatch(`/api/operators/${id}`, patch)),
    resetPassword: (id: string, password: string) => run(() => httpPatch(`/api/operators/${id}`, { password })),
    remove: (id: string) => run(() => httpDel(`/api/operators/${id}`)),
  };
}
