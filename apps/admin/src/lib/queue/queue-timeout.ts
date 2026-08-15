import { NextResponse } from "next/server";

/**
 * Guardrails so a slow/unreachable Redis never wedges a request thread.
 *
 * `cloneQueue`'s ioredis is configured with `maxRetriesPerRequest: null`, which
 * means a command issued while Redis is down does NOT reject — it queues and
 * retries forever. Any route that touches the queue (enqueue/remove/pause) would
 * therefore hang indefinitely if Redis is unreachable (e.g. local dev with no
 * Redis). Racing the op against a timeout turns that hang into a fast, typed
 * failure the route can surface.
 *
 * This is safe to fail: an orphaned `status="queued"` job (DB says queued but it
 * never reached Redis) is recovered automatically by the worker-boot reconciler
 * (`apps/worker/src/reconciler.ts`) and by `POST /api/clone/queue/resume`, which
 * re-enqueues every DB-queued job. On prod Redis answers in ~ms so the timeout
 * never fires.
 */
export const QUEUE_OP_TIMEOUT_MS = 3000;

export class QueueTimeoutError extends Error {
  constructor(message = "Queue operation timed out (Redis unreachable?)") {
    super(message);
    this.name = "QueueTimeoutError";
  }
}

/** Race a queue (Redis) operation against a timeout, rejecting with QueueTimeoutError. */
export function withQueueTimeout<T>(op: Promise<T>, ms: number = QUEUE_OP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QueueTimeoutError()), ms);
  });
  return Promise.race([op, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** True when an error came from `withQueueTimeout` giving up on Redis. */
export function isQueueTimeout(err: unknown): err is QueueTimeoutError {
  return err instanceof QueueTimeoutError;
}

/**
 * Standard 503 for when a per-job queue op timed out. The DB status change (if
 * any) has already been committed, so the message tells the operator the work
 * is not lost — it will be re-enqueued by the reconciler / Resume button.
 */
export function queueUnavailableResponse(extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json(
    {
      error:
        "Không kết nối được hàng đợi xử lý (Redis). Trạng thái đã được cập nhật; job sẽ tự động được đẩy lại khi worker khởi động lại hoặc khi bấm 'Tiếp tục' queue.",
      queueUnavailable: true,
      ...extra,
    },
    { status: 503 },
  );
}
