import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const email = `e2e_${Date.now()}@test.co`;

describe("Auth (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("register → login → refresh", async () => {
    const reg = await request(app.getHttpServer()).post("/api/auth/register").send({ email, password: "password1", name: "E2E" });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeTruthy();

    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password: "password1" });
    expect(login.status).toBe(201);

    const refresh = await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(201);
    expect(refresh.body.accessToken).toBeTruthy();
  });

  it("rejects an invalid login", async () => {
    const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password: "nope" });
    expect(res.status).toBe(401);
  });
});
