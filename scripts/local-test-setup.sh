#!/bin/bash
# Local test setup for the Source Cover / gen-cover flow.
# Prereq: Docker Desktop engine running. Uses docker-compose.yml +
# docker-compose.override.yml (write enabled). Local Postgres/Redis in-container.
set -e
cd "$(dirname "$0")/.."

DB="postgresql://postgres:postgres@postgres:5432/coloring"

echo "[1/4] Build + start local stack (admin:3000, worker, mobile-api:3001, postgres, redis)..."
docker compose up -d --build

echo "[2/4] Wait for Postgres healthy..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' vx-postgres 2>/dev/null)" = "healthy" ]; do sleep 2; done

echo "[3/4] Push Prisma schema to the local DB..."
docker compose run --rm --no-deps \
  -e DATABASE_URL="$DB" -e DIRECT_URL="$DB" \
  admin sh -c 'cd /app/packages/db && npx prisma db push --accept-data-loss --skip-generate'

echo "[4/4] Seed a test book (interiors point at real prod R2 images so gen has input)..."
docker exec -i vx-postgres psql -U postgres -d coloring <<'SQL'
INSERT INTO "Book" (id, title, "updatedAt", "coloringPages", data, "isPublic")
VALUES ('local-test-book','Local Test Book',CURRENT_TIMESTAMP,
'[{"id":"lp-2","url":"/assets/a92b7b2c-6b1f-4b06-ada7-8ba606d36f04/pages/page-002.png","status":"done"},
  {"id":"lp-3","url":"/assets/a92b7b2c-6b1f-4b06-ada7-8ba606d36f04/pages/page-003.png","status":"done"},
  {"id":"lp-4","url":"/assets/a92b7b2c-6b1f-4b06-ada7-8ba606d36f04/pages/page-004.png","status":"done"},
  {"id":"lp-5","url":"/assets/a92b7b2c-6b1f-4b06-ada7-8ba606d36f04/pages/page-005.png","status":"done"}]'::jsonb,
'{}'::jsonb,false)
ON CONFLICT (id) DO UPDATE SET "coloringPages"=EXCLUDED."coloringPages", "updatedAt"=CURRENT_TIMESTAMP;
SQL

echo ""
echo "DONE."
echo "  Admin:      http://localhost:3000"
echo "  Test book:  id = local-test-book (mở Chi tiết sách → mục Source Cover → Gen Cover)"
echo "  Logs:       docker compose logs -f admin"
echo "  Stop:       docker compose down     (thêm -v để xoá DB local)"
