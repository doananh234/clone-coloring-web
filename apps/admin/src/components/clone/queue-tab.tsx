"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, getFirestore } from "firebase/firestore";
import { useFirebase } from "@vx/core-uikit/firebase";
import { Badge, Button } from "@vx/core-uikit/components";
import { toast } from "sonner";
import Link from "next/link";

interface JobRow {
  id: string;
  name: string;
  status: string;
  currentStep?: string;
  failedStep?: string;
  retryHistory?: Array<{ step: string }>;
  createdAt: string;
}

export function QueueTab() {
  const { app } = useFirebase();
  const [rows, setRows] = useState<JobRow[]>([]);

  useEffect(() => {
    const db = getFirestore(app);
    const q = query(
      collection(db, "cloneJobs"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<JobRow, "id">) })),
      );
    });
    return unsub;
  }, [app]);

  async function call(path: string, okMessage: string) {
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.success(okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Clone queue ({rows.length})</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => call("/api/clone/queue/pause", "Queue paused")}
          >
            Pause queue
          </Button>
          <Button
            variant="outline"
            onClick={() => call("/api/clone/queue/resume", "Queue resumed")}
          >
            Resume queue
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Step</th>
              <th className="text-left p-3">Retries</th>
              <th className="text-left p-3">Created</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <Link href={`/clone/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="p-3">
                  <Badge variant={r.status === "error" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {r.failedStep ?? r.currentStep ?? "-"}
                </td>
                <td className="p-3 text-muted-foreground">
                  {r.retryHistory?.length ?? 0}
                </td>
                <td className="p-3 text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  {r.status === "error" && (
                    <Button
                      size="sm"
                      onClick={() => call(`/api/clone/${r.id}/retry`, `Re-enqueued ${r.id}`)}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No clone jobs yet. Use the Import CSV tab to enqueue some.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
