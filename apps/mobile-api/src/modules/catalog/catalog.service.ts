import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@vx/db";

import { PrismaService } from "../../prisma/prisma.service";
import { parseListQuery, parseSort, toPage, type Paginated } from "../../common/pagination";
import type { BookListParams } from "./dto";

const BOOK_SORT_FIELDS = ["createdAt", "title", "priceAmount"];
const SORT_ALIASES: Record<string, string> = { price: "priceAmount" };

/** Builds the Prisma `where` for a public-book query. Exported for unit testing. */
export function buildBookWhere(params: BookListParams, extra: Prisma.BookWhereInput = {}): Prisma.BookWhereInput {
  const where: Prisma.BookWhereInput = { ...extra, isPublic: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.search && params.search.trim().length > 0) {
    const q = params.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { subtitle: { contains: q, mode: "insensitive" } },
    ];
  }
  const min = params.minPrice ? Math.round(Number(params.minPrice) * 100) : undefined;
  const max = params.maxPrice ? Math.round(Number(params.maxPrice) * 100) : undefined;
  if (Number.isFinite(min) || Number.isFinite(max)) {
    where.priceAmount = {
      ...(Number.isFinite(min) ? { gte: min } : {}),
      ...(Number.isFinite(max) ? { lte: max } : {}),
    };
  }
  return where;
}

function resolveSort(sort?: string): Record<string, "asc" | "desc"> {
  const [field, dir] = (sort ?? "createdAt:desc").split(":");
  const mapped = SORT_ALIASES[field] ?? field;
  return parseSort(`${mapped}:${dir ?? "desc"}`, BOOK_SORT_FIELDS, "createdAt:desc");
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      where: { isPublic: true },
      orderBy: [{ index: "asc" }, { name: "asc" }],
    });
  }

  async listBooks(params: BookListParams, extra: Prisma.BookWhereInput = {}): Promise<Paginated<unknown>> {
    const q = parseListQuery(params);
    const where = buildBookWhere(params, extra);
    const [rows, total] = await Promise.all([
      this.prisma.book.findMany({ where, orderBy: resolveSort(params.sort), skip: q.skip, take: q.limit }),
      this.prisma.book.count({ where }),
    ]);
    return toPage(rows, total, q);
  }

  async getBook(id: string) {
    const book = await this.prisma.book.findFirst({ where: { id, isPublic: true } });
    if (!book) throw new NotFoundException("Book not found");
    return book;
  }
}
