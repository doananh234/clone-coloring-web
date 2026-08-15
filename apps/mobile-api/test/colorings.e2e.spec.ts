import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("Colorings (e2e)", () => {
  let app: INestApplication;
  let userId: string;
  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    const reg = await request(app.getHttpServer()).post("/api/auth/register").send({ email: `col_${Date.now()}@test.co`, password: "password1" });
    userId = reg.body.user.id;
  });
  afterAll(async () => { await app.close(); });

  it("creates, lists, and 404s cross-user", async () => {
    const created = await request(app.getHttpServer()).post("/api/me/colorings").set("x-user-id", userId).send({ bookId: "book-x", pageIndex: 0 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app.getHttpServer()).get("/api/me/colorings?status=in_progress").set("x-user-id", userId);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);

    const other = await request(app.getHttpServer()).get(`/api/me/colorings/${id}`).set("x-user-id", "someone-else");
    expect(other.status).toBe(404);
  });
});
