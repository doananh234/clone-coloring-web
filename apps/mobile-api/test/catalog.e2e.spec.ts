import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("Catalog (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /api/catalog/books is public and paginated", async () => {
    const res = await request(app.getHttpServer()).get("/api/catalog/books?limit=5");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
  });

  it("GET /api/catalog/categories is public", async () => {
    const res = await request(app.getHttpServer()).get("/api/catalog/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
