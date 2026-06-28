import { db } from "./firestore";
import { cloneQueue } from "./queue";

interface Deps {
  now?: () => Date;
  maxAgeMs?: number;
}

export async function reconcileStaleJobs(deps: Deps = {}): Promise<{ recovered: string[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const maxAgeMs = deps.maxAgeMs ?? 15 * 60_000;
  const threshold = new Date(now.getTime() - maxAgeMs).toISOString();

  const snap = await db
    .collection("cloneJobs")
    .where("status", "in", ["queued", "running"])
    .where("updatedAt", "<", threshold)
    .get();

  const recovered: string[] = [];
  for (const doc of snap.docs) {
    const id = doc.id;
    await cloneQueue.add("process", { cloneJobId: id }, { jobId: id });
    recovered.push(id);
  }
  return { recovered };
}
