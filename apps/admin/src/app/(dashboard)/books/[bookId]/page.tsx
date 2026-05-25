"use client";
import { useParams } from "next/navigation";
import { BookDetailPage } from "@/views/book-detail-page";
export default function BookDetailRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  return <BookDetailPage bookId={bookId} />;
}
