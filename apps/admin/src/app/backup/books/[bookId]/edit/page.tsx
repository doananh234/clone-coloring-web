"use client";
import { useParams } from "next/navigation";
import { BookEditPage } from "@/views/book-edit-page";
export default function BookEditRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  return <BookEditPage bookId={bookId} />;
}
