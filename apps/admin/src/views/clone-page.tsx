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
import type { CloneJob } from "@/lib/ai/clone-types";

const STEPS = [
  { title: "Upload PDF", description: "Drop or browse PDF file", icon: faFilePdf },
  { title: "Preview Pages", description: "Review extracted thumbnails", icon: faImages },
  { title: "Analyze & Review", description: "AI analysis with review", icon: faWandMagicSparkles },
  { title: "Redesign Pages", description: "Original + prompt → new version", icon: faPaintbrushPencil },
  { title: "Extract & Generate", description: "Save entities & generate refs", icon: faUsers },
  { title: "Reproduce Book", description: "Review results & create book", icon: faSparkles },
];

interface ClonePageProps {
  existingJobId?: string;
}

export function ClonePage({ existingJobId }: ClonePageProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [job, setJob] = useState<CloneJob | null>(null);
  const [loading, setLoading] = useState(!!existingJobId);

  // Load existing job
  useEffect(() => {
    if (!existingJobId) return;

    (async () => {
      try {
        const res = await fetch(`/api/clone/${existingJobId}`);
        const data = await res.json();
        if (data.success) {
          setJob(data.job);
          // Resume at appropriate step
          if (data.job.status === "reproduced") setCurrentStep(5);
          else if (data.job.status === "entities_ready") setCurrentStep(5);
          else if (data.job.status === "confirmed") setCurrentStep(4);
          else if (data.job.status === "analyzed") setCurrentStep(3);
          else if (data.job.status === "extracted") setCurrentStep(1);
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
        s === "confirmed" ||
        s === "entities_ready" ||
        s === "reproduced"
      );
    if (step === 3) return currentStep > 3;
    if (step === 4) return s === "entities_ready" || s === "reproduced";
    if (step === 5) return s === "reproduced";
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
            <CloneExtractStep
              job={job}
              onJobUpdate={handleJobUpdate}
              onNext={() => setCurrentStep(5)}
              onBack={() => setCurrentStep(3)}
            />
          )}

          {currentStep === 5 && job && (
            <CloneReproduceStep job={job} onBack={() => setCurrentStep(4)} />
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
