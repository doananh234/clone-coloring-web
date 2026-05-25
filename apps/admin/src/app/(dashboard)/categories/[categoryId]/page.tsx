"use client";
import { useParams } from "next/navigation";
import { CategoryDetailPage } from "@/views/category-detail-page";
export default function CategoryDetailRoute() {
  const { categoryId } = useParams<{ categoryId: string }>();
  return <CategoryDetailPage categoryId={categoryId} />;
}
