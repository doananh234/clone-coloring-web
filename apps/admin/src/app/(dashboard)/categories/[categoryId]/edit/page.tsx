"use client";
import { useParams } from "next/navigation";
import { CategoryEditPage } from "@/views/category-edit-page";
export default function CategoryEditRoute() {
  const { categoryId } = useParams<{ categoryId: string }>();
  return <CategoryEditPage categoryId={categoryId} />;
}
