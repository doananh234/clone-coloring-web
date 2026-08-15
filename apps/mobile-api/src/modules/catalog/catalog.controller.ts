import { Controller, Get, Param, Query } from "@nestjs/common";

import { Public } from "../../common/public.decorator";
import { CatalogService } from "./catalog.service";
import type { BookListParams } from "./dto";

@Public()
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  categories() {
    return this.catalog.listCategories();
  }

  @Get("books")
  books(@Query() query: BookListParams) {
    return this.catalog.listBooks(query);
  }

  @Get("books/:id")
  book(@Param("id") id: string) {
    return this.catalog.getBook(id);
  }

  @Get("categories/:id/books")
  booksByCategory(@Param("id") id: string, @Query() query: BookListParams) {
    return this.catalog.listBooks({ ...query, categoryId: id });
  }
}
