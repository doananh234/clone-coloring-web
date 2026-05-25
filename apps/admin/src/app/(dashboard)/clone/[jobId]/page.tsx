"use client";

import { useParams } from "next/navigation";
import { ClonePage } from "@/views/clone-page";

export default function CloneWithIdPage() {
  const params = useParams<{ jobId: string }>();
  return <ClonePage existingJobId={params?.jobId} />;
}
