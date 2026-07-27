"use client";
import { useParams } from "next/navigation";
import { BookCreatePage } from "@/views/book-create-page";
export default function BooksNewWithIdPage() {
  const params = useParams<{ bookId: string }>();
  return <BookCreatePage existingBookId={params?.bookId} />;
}
