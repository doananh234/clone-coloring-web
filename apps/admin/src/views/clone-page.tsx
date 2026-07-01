"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilePdf,
  faImages,
  faWandMagicSparkles,
  faCheck,
  faCircleCheck,
  faRotate,
  faTrash,
  faBook,
} from "@fortawesome/pro-regular-svg-icons";
import { Badge, Button } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { cn } from "@vx/core-uikit/utils";
import {
  faPaintbrushPencil,
  faUsers,
  faSparkles,
} from "@fortawesome/pro-regular-svg-icons";
import { CloneUploadStep } from "@/components/clone-upload-step";
import { ClonePreviewStep } from "@/components/clone-preview-step";
import { CloneAnalyzeStep } from "@/components/clone-analyze-step";
import { CloneRedesignStep } from "@/components/clone-redesign-step";
import { CloneExtractStep } from "@/components/clone-extract-step";
import { CloneReproduceStep } from "@/components/clone-reproduce-step";
import type { CloneJob } from "@vx/server-core/ai/clone-types";

const STEPS = [
  { title: "Upload PDF", description: "Drop or browse PDF file", icon: faFilePdf },
  { title: "Preview Pages", description: "Review extracted thumbnails", icon: faImages },
  { title: "Analyze & Review", description: "AI analysis with review", icon: faWandMagicSparkles },
  { title: "Redesign Pages", description: "Original + prompt → new version", icon: faPaintbrushPencil },
  { title: "Reproduce Book", description: "Review results & create book", icon: faSparkles },
  { title: "Extract Library", description: "Save characters & locations", icon: faUsers },
];

interface ClonePageProps {
  existingJobId?: string;
}

const STEP_LABELS: Record<string, string> = {
  download: "Downloading source PDF",
  render: "Rendering pages to images",
  analyze: "Analyzing pages with AI",
  "extract-entities": "Extracting characters & locations",
  reproduce: "Reproducing pages",
  "create-book": "Creating the new book",
};

function WorkerProgressBanner({
  status,
  currentStep,
  analyzedPages,
  totalPages,
  jobId,
}: {
  status: string;
  currentStep?: string;
  analyzedPages?: number;
  totalPages?: number;
  jobId: string;
}) {
  async function handleStart() {
    try {
      const res = await fetch(`/api/clone/${jobId}/start`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      notify.success("Started");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === "pending") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <span className="text-lg">⏸</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Pending — not started yet</p>
          <p className="text-xs text-amber-800">
            Imported from CSV with Select=FALSE. Click Start to queue it for processing.
          </p>
        </div>
        <Button size="sm" onClick={handleStart}>Start</Button>
      </div>
    );
  }

  if (status === "queued") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <span className="text-lg">⏳</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Queued — waiting for the worker</p>
          <p className="text-xs text-gray-700">
            The worker is busy with another job. This one will pick up automatically.
          </p>
        </div>
      </div>
    );
  }

  // status === "running" — `currentStep` is the last COMPLETED step,
  // so the worker is processing the NEXT one in the pipeline.
  // Auto pipeline: download → render → analyze → reproduce → create-book.
  // extract-entities is NOT in the auto chain — user triggers it manually
  // after the book is ready (fallback below covers manual completion).
  const nextRunning =
    currentStep === "create-book" ? null
    : currentStep === "reproduce" ? "create-book"
    : currentStep === "analyze" ? "reproduce"
    : currentStep === "extract-entities" ? "reproduce"
    : currentStep === "render" ? "analyze"
    : currentStep === "download" ? "render"
    : "download";

  const stepLabel = nextRunning ? STEP_LABELS[nextRunning] ?? nextRunning : "Finishing up";
  const progress =
    nextRunning === "analyze" && totalPages && totalPages > 0
      ? `${analyzedPages ?? 0} / ${totalPages} pages`
      : null;

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">Worker is running</p>
          <p className="text-xs text-blue-800">
            <span className="font-medium">{stepLabel}</span>
            {progress && <span className="ml-2">· {progress}</span>}
          </p>
        </div>
        <span className="text-xs font-mono text-blue-700">{nextRunning ?? "done"}</span>
      </div>
    </div>
  );
}

function ErrorAlert({
  error,
  failedStep,
  retryHistory,
  jobId,
  onRetried,
}: {
  error?: string;
  failedStep?: string;
  retryHistory?: Array<{ step: string; attempt?: number; error?: string; at?: string }>;
  jobId: string;
  onRetried: () => void;
}) {
  const totalRetries = retryHistory?.length ?? 0;
  const stepRetries = failedStep
    ? (retryHistory ?? []).filter((r) => r.step === failedStep).length
    : 0;

  async function handleRetry() {
    try {
      const res = await fetch(`/api/clone/${jobId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      notify.success("Re-enqueued for retry");
      onRetried();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRecheck() {
    try {
      const res = await fetch(`/api/clone/${jobId}/recheck`, { method: "POST" });
      const body = await res.json();
      // Log everything to the console so operators can inspect the full
      // Diaflow payload — the UI just surfaces the summary.
      console.log("[clone recheck]", body);
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const summary =
        `Diaflow status: ${body.diaflowStatus}. ` +
        `Parsed pages: ${body.pageCount}.` +
        (body.parseError ? ` Parse error: ${body.parseError}` : "");
      notify.success(`Recheck complete — ${summary} (see console for raw payload)`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none">❌</span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-red-900">
            Clone failed{failedStep ? ` at step "${failedStep}"` : ""}
            {stepRetries > 0 && ` (${stepRetries}/5 attempts)`}
          </p>
          {error && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-red-800">
              {error}
            </pre>
          )}
          {totalRetries > 0 && retryHistory && (
            <details className="text-xs text-red-800">
              <summary className="cursor-pointer">
                Retry history ({totalRetries})
              </summary>
              <ul className="mt-2 space-y-1">
                {retryHistory.map((r, i) => (
                  <li key={i} className="border-t border-red-200/60 pt-1 first:border-0">
                    <span className="font-mono text-red-700/70">{r.at}</span>{" "}
                    <span className="font-medium">{r.step}</span>
                    {r.attempt != null && <span> #{r.attempt}</span>}: {r.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={handleRetry}>
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={handleRecheck}>
            Recheck
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ClonePage({ existingJobId }: ClonePageProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [job, setJob] = useState<CloneJob | null>(null);
  const [loading, setLoading] = useState(!!existingJobId);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerateOriginals() {
    if (!job || regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/clone/${job.id}/sync-original`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      notify.success(
        `Regenerated ${body.updatedPages} original page(s) — reloading…`,
      );
      // Full reload so every step component picks up the new imageUrls.
      window.location.reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
      setRegenerating(false);
    }
  }

  // Load existing job
  useEffect(() => {
    if (!existingJobId) return;

    (async () => {
      try {
        const res = await fetch(`/api/clone/${existingJobId}`);
        const data = await res.json();
        if (data.success) {
          setJob(data.job);
          // Resume at appropriate step based on job status
          const s = data.job.status;
          if (s === "entities_ready") setCurrentStep(5);
          else if (s === "reproduced") setCurrentStep(4);
          else if (s === "confirmed") setCurrentStep(4);
          else if (s === "analyzed") setCurrentStep(3);
          else if (s === "analyzing" || s === "error") setCurrentStep(2); // back to analyze to retry/skip
          else if (s === "extracted") setCurrentStep(1);
          // Worker-driven statuses. `currentStep` = last *completed* step,
          // so the worker is processing the NEXT step. Map that to the
          // equivalent manual UI step.
          else if (s === "running" || s === "queued") {
            const lastDone = (data.job as { currentStep?: string }).currentStep;
            // Auto pipeline skips extract-entities — analyze → reproduce directly.
            // extract-entities fallback covers the case where user manually completed it.
            const nextRunning =
              lastDone === "create-book" ? null  // nothing left
              : lastDone === "reproduce" ? "create-book"
              : lastDone === "analyze" ? "reproduce"
              : lastDone === "extract-entities" ? "reproduce"
              : lastDone === "render" ? "analyze"
              : lastDone === "download" ? "render"
              : "download"; // not started yet
            const uiStep =
              nextRunning === "download" ? 0
              : nextRunning === "render" ? 1
              : nextRunning === "analyze" ? 2
              : nextRunning === "reproduce" ? 4
              : nextRunning === "create-book" ? 5
              : 5; // nothing left → end of flow
            setCurrentStep(uiStep);
          }
          else if (s === "pending") setCurrentStep(1); // sit at Preview Pages
        }
      } catch (err) {
        console.error("Failed to load clone job:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [existingJobId]);

  const handleUploaded = useCallback(
    (newJob: CloneJob) => {
      setJob(newJob);
      setCurrentStep(1);
      router.replace(`/clone/${newJob.id}`);
    },
    [router],
  );

  const handleJobUpdate = useCallback((updated: CloneJob) => {
    setJob(updated);
  }, []);

  const completedStep = (step: number) => {
    if (!job) return step < 0;
    const s = job.status;
    if (step === 0) return s !== "uploading";
    if (step === 1) return currentStep > 1;
    if (step === 2)
      return (
        s === "analyzed" ||
        s === "analyzing" ||
        s === "error" ||
        s === "confirmed" ||
        s === "entities_ready" ||
        s === "reproduced"
      );
    if (step === 3) return currentStep > 3;
    if (step === 4) return s === "reproduced" || s === "entities_ready";
    if (step === 5) return s === "entities_ready";
    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Loading clone job...</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left sidebar — step navigation */}
      <div className="w-[240px] shrink-0">
        <div className="sticky top-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Clone from PDF</h2>
            <p className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {STEPS.length}
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Job utilities — only shown when a job is loaded */}
          {job && (
            <div className="rounded-md border border-dashed p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Job Utilities
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleRegenerateOriginals}
                disabled={regenerating}
                title="Re-render page images from the source PDF and merge them into job.pages"
              >
                <FontAwesomeIcon
                  icon={faRotate}
                  className={cn("mr-2 h-3.5 w-3.5", regenerating && "animate-spin")}
                />
                {regenerating ? "Regenerating…" : "Regenerate Original Images"}
              </Button>
            </div>
          )}

          {/* Step buttons */}
          <div className="space-y-1">
            {STEPS.map((step, idx) => {
              const isActive = idx === currentStep;
              const isCompleted = completedStep(idx);
              const isClickable = isCompleted || idx <= currentStep;

              return (
                <button
                  key={idx}
                  onClick={() => isClickable && setCurrentStep(idx)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors",
                    isActive && "bg-primary/10 text-primary",
                    !isActive && isClickable && "hover:bg-muted",
                    !isClickable && "cursor-default opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      isCompleted &&
                        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                      isActive && !isCompleted && "bg-primary text-primary-foreground",
                      !isActive && !isCompleted && "bg-muted text-muted-foreground",
                    )}
                  >
                    {isCompleted ? (
                      <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground">{step.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right content */}
      <div className="min-w-0 flex-1">
        {/* Worker progress banner — shown while a worker-driven job is in flight */}
        {job && (job.status === "running" || job.status === "queued" || job.status === "pending") && (
          <WorkerProgressBanner
            status={job.status}
            currentStep={(job as { currentStep?: string }).currentStep}
            analyzedPages={job.analyzedPages}
            totalPages={job.totalPages}
            jobId={job.id}
          />
        )}

        {/* Error banner — shown whenever the job is in error state */}
        {job && (job.status === "error" || (job as { failedStep?: string }).failedStep) && (
          <ErrorAlert
            error={(job as { error?: string }).error}
            failedStep={(job as { failedStep?: string }).failedStep}
            retryHistory={(job as { retryHistory?: Array<{ step: string }> }).retryHistory}
            jobId={job.id}
            onRetried={() => router.refresh()}
          />
        )}

        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-base font-semibold">{STEPS[currentStep].title}</h3>

          {currentStep === 0 && (
            <div className="space-y-6">
              <CloneUploadStep onUploaded={handleUploaded} />
              <CloneJobList />
            </div>
          )}

          {currentStep === 1 && job && (
            <ClonePreviewStep
              pages={job.pages}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}

          {currentStep === 2 && job && (
            <CloneAnalyzeStep
              job={job}
              onJobUpdate={handleJobUpdate}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && job && (
            <CloneRedesignStep
              job={job}
              onJobUpdate={handleJobUpdate}
              onNext={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && job && (
            <CloneReproduceStep job={job} onBack={() => setCurrentStep(3)} onNext={() => setCurrentStep(5)} />
          )}

          {currentStep === 5 && job && (
            <CloneExtractStep
              job={job}
              onJobUpdate={handleJobUpdate}
              onBack={() => setCurrentStep(4)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Clone Job List (shown on upload step) ---

type CloneJobSummary = {
  id: string;
  name: string;
  status: string;
  totalPages: number;
  analyzedPages: number;
  bookId: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  extracted: "bg-blue-100 text-blue-700",
  analyzing: "bg-yellow-100 text-yellow-700",
  analyzed: "bg-purple-100 text-purple-700",
  confirmed: "bg-green-100 text-green-700",
  entities_ready: "bg-indigo-100 text-indigo-700",
  reproduced: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

function CloneJobList() {
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cloneJobs"],
    queryFn: () => fetch("/api/clone").then((r) => r.json()),
  });

  const jobs: CloneJobSummary[] = data?.data ?? [];

  async function handleDelete(jobId: string, jobName: string) {
    if (!confirm(`Delete clone job "${jobName}"?`)) return;
    try {
      const res = await fetch(`/api/clone/${jobId}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) {
        notify.success("Clone job deleted");
        refetch();
      } else {
        notify.error(result.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete clone job");
    }
  }

  if (isLoading) return null;
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Previous Clone Jobs</h3>
        <span className="text-xs text-muted-foreground">{jobs.length} jobs</span>
      </div>
      <div className="max-h-[300px] space-y-2 overflow-y-auto">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <FontAwesomeIcon icon={faFilePdf} className="h-5 w-5 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{job.name}</p>
              <p className="text-xs text-muted-foreground">
                {job.totalPages} pages
                {job.analyzedPages > 0 && ` • ${job.analyzedPages} analyzed`}
                {job.createdAt && ` • ${new Date(job.createdAt).toLocaleDateString()}`}
              </p>
            </div>
            <Badge
              variant="secondary"
              className={`shrink-0 text-[10px] ${STATUS_COLORS[job.status] || ""}`}
            >
              {job.status}
            </Badge>
            <div className="flex shrink-0 gap-1">
              {job.bookId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="View Book"
                  onClick={() => router.push(`/books/${job.bookId}`)}
                >
                  <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5 text-green-600" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Resume Job"
                onClick={() => router.push(`/clone/${job.id}`)}
              >
                <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Delete Job"
                onClick={() => handleDelete(job.id, job.name)}
              >
                <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
