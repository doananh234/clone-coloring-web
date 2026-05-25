"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilePdf,
  faImages,
  faWandMagicSparkles,
  faCheck,
  faCircleCheck,
} from "@fortawesome/pro-regular-svg-icons";
import { cn } from "@vx/core-uikit/utils";
import { CloneUploadStep } from "@/components/clone-upload-step";
import { ClonePreviewStep } from "@/components/clone-preview-step";
import { CloneAnalyzeStep } from "@/components/clone-analyze-step";
import { CloneConfirmStep } from "@/components/clone-confirm-step";
import type { CloneJob } from "@/lib/ai/clone-types";

const STEPS = [
  { title: "Upload PDF", description: "Drop or browse PDF file", icon: faFilePdf },
  { title: "Preview Pages", description: "Review extracted thumbnails", icon: faImages },
  { title: "Analyze & Review", description: "AI analysis with review", icon: faWandMagicSparkles },
  { title: "Confirm & Save", description: "Save entities to library", icon: faCheck },
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
          if (data.job.status === "confirmed") setCurrentStep(3);
          else if (data.job.status === "analyzed") setCurrentStep(2);
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
    if (step === 0) return job.status !== "uploading";
    if (step === 1) return currentStep > 1;
    if (step === 2) return job.status === "analyzed" || job.status === "confirmed";
    if (step === 3) return job.status === "confirmed";
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

          {currentStep === 0 && <CloneUploadStep onUploaded={handleUploaded} />}

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
            <CloneConfirmStep job={job} onBack={() => setCurrentStep(2)} />
          )}
        </div>
      </div>
    </div>
  );
}
