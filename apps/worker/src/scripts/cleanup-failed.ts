/**
 * Cleanup failed clone jobs:
 *   - Deletes the cloneJob row
 *   - Deletes child `characters` / `locations` (matched on data.cloneJobId)
 *   - Deletes any `books` whose data.sourceCloneJobId matches
 *   - Deletes all R2 objects under `assets/clone-jobs/<jobId>/`
 *   - Removes the BullMQ job entry from the `clone-jobs` queue
 *
 * Usage:
 *   yarn cleanup                          # purge all jobs with status=failed
 *   yarn cleanup <jobId> [<jobId> ...]    # purge specific job(s) regardless of status
 *   yarn cleanup --dry-run                # list what would be deleted, change nothing
 */

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { db } from "../db";
import { cloneQueue } from "../queue";
import { getR2Config, createR2Client } from "@vx/server-core/r2";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const wipeAll = args.includes("--all");
const explicitIds = args.filter((a) => !a.startsWith("--"));

function log(msg: string) {
  console.log(`[cleanup]${dryRun ? " [dry-run]" : ""} ${msg}`);
}

async function listJobIdsToCleanup(): Promise<string[]> {
  if (explicitIds.length) return explicitIds;
  if (wipeAll) {
    const rows = await db.cloneJob.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await db.cloneJob.findMany({
    where: { status: "failed" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function deleteR2Prefix(client: S3Client, bucket: string, prefix: string): Promise<number> {
  let continuationToken: string | undefined;
  let totalDeleted = 0;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (list.Contents ?? []).filter((o) => o.Key).map((o) => ({ Key: o.Key! }));
    if (objects.length) {
      if (dryRun) {
        log(`would delete ${objects.length} R2 objects under ${prefix}`);
      } else {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      totalDeleted += objects.length;
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return totalDeleted;
}

// Generic helper for child rows where the foreign jobId lives inside the
// `data` Json column (Prisma JsonFilter path query).
async function deleteChildrenByJsonField(
  model: "character" | "location" | "book",
  path: string[],
  jobId: string,
): Promise<number> {
  // Each delegate has its own narrow generic shape; widen to a structural
  // shape because we only need count / deleteMany.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = db[model] as any;
  const where = { data: { path, equals: jobId } };
  const count: number = await delegate.count({ where });
  if (count === 0) return 0;
  if (dryRun) {
    log(`would delete ${count} ${model} rows where data.${path.join(".")}=${jobId}`);
    return count;
  }
  const result: { count: number } = await delegate.deleteMany({ where });
  return result.count;
}

async function cleanupJob(jobId: string, s3: S3Client, bucket: string) {
  log(`--- cleaning job ${jobId} ---`);

  const r2Removed = await deleteR2Prefix(s3, bucket, `assets/clone-jobs/${jobId}/`);
  log(`R2 objects removed: ${r2Removed}`);

  const charsRemoved = await deleteChildrenByJsonField("character", ["cloneJobId"], jobId);
  log(`characters removed: ${charsRemoved}`);

  const locsRemoved = await deleteChildrenByJsonField("location", ["cloneJobId"], jobId);
  log(`locations removed: ${locsRemoved}`);

  const booksRemoved = await deleteChildrenByJsonField("book", ["sourceCloneJobId"], jobId);
  log(`books removed: ${booksRemoved}`);

  if (!dryRun) {
    await db.cloneJob.delete({ where: { id: jobId } });
    log(`cloneJob row deleted`);
  } else {
    log(`would delete cloneJob row`);
  }

  try {
    const queueJob = await cloneQueue.getJob(jobId);
    if (queueJob) {
      if (dryRun) {
        log(`would remove BullMQ job ${jobId}`);
      } else {
        await queueJob.remove();
        log(`BullMQ job removed`);
      }
    }
  } catch (err) {
    log(`warn: failed to remove BullMQ job (${(err as Error).message})`);
  }
}

async function main() {
  const jobIds = await listJobIdsToCleanup();
  if (!jobIds.length) {
    log("nothing to clean — no failed jobs found and no jobIds passed");
    return;
  }
  log(`target jobs: ${jobIds.length}`);

  const r2Config = getR2Config();
  const s3 = createR2Client(r2Config);

  for (const id of jobIds) {
    try {
      await cleanupJob(id, s3, r2Config.bucket);
    } catch (err) {
      log(`ERROR cleaning ${id}: ${(err as Error).message}`);
    }
  }

  log("done");
}

main()
  .then(async () => {
    await cloneQueue.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await cloneQueue.close().catch(() => {});
    process.exit(1);
  });
