import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

interface RawSection { title?: string; bookIds?: string[] }
interface RawHome { banners?: unknown[]; sections?: RawSection[]; featuredCategoryIds?: string[] }

export interface HomeBook { id: string; title: string; coverUrl: string; priceAmount: number | null }
export interface HomeResponse {
  banners: unknown[];
  sections: { title: string; books: HomeBook[] }[];
  featuredCategories: unknown[];
}

/** Pure resolver — maps the raw config JSON to hydrated rows. Exported for tests. */
export function resolveConfig(
  raw: RawHome,
  booksById: Map<string, HomeBook>,
  categoriesById: Map<string, unknown>,
): HomeResponse {
  const sections = (raw.sections ?? []).map((s) => ({
    title: s.title ?? "",
    books: (s.bookIds ?? []).map((id) => booksById.get(id)).filter((b): b is HomeBook => Boolean(b)),
  }));
  const featuredCategories = (raw.featuredCategoryIds ?? [])
    .map((id) => categoriesById.get(id))
    .filter((c) => Boolean(c));
  return { banners: raw.banners ?? [], sections, featuredCategories };
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(): Promise<HomeResponse> {
    const app = await this.prisma.app.findUnique({ where: { id: "default" } });
    const data = (app?.data as Record<string, unknown> | null) ?? {};
    const raw = (data.mobileHome as RawHome | undefined) ?? {};

    const bookIds = [...new Set((raw.sections ?? []).flatMap((s) => s.bookIds ?? []))];
    const categoryIds = raw.featuredCategoryIds ?? [];

    const [books, categories] = await Promise.all([
      bookIds.length
        ? this.prisma.book.findMany({
            where: { id: { in: bookIds }, isPublic: true },
            select: { id: true, title: true, coverUrl: true, priceAmount: true },
          })
        : Promise.resolve([]),
      categoryIds.length
        ? this.prisma.category.findMany({ where: { id: { in: categoryIds }, isPublic: true } })
        : Promise.resolve([]),
    ]);

    const booksById = new Map(books.map((b) => [b.id, b as HomeBook]));
    const categoriesById = new Map((categories as { id: string }[]).map((c) => [c.id, c]));
    return resolveConfig(raw, booksById, categoriesById);
  }
}
