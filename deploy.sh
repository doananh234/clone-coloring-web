#!/bin/bash
# deploy.sh — Deploy VX Admin monorepo to production server.
# Replaces the previous Book-AI deployment on the same EC2 host.
set -e

SERVER="ec2-user@3.216.170.208"
REMOTE_DIR="/opt/vx-admin"
OLD_REMOTE_DIR="/opt/bookai"
SSH_OPTS="-o StrictHostKeyChecking=no"

echo "=== VX Admin Deploy ==="

# Pre-flight: production env files must exist locally (they are git-ignored).
# Distinct from the local-dev .env.local / .env files so dev secrets never
# leak to prod. Both files get rsync'd + loaded by docker-compose.prod.yml.
for f in apps/admin/.env.prod apps/worker/.env.prod; do
    if [ ! -f "$f" ]; then
        echo "ERROR: $f not found. Copy from the matching .env.example and fill in production secrets." >&2
        exit 1
    fi
done

# Docker Compose file set used for every remote docker command below.
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

# 0. Tear down old Book-AI deployment (idempotent: skipped if already removed).
echo "[0/4] Cleaning up old Book-AI deployment (if present)..."
ssh ${SSH_OPTS} ${SERVER} "
    if [ -d ${OLD_REMOTE_DIR} ]; then
        echo '  -> Stopping Book-AI containers...'
        cd ${OLD_REMOTE_DIR}
        docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans 2>/dev/null \
            || docker compose down -v --remove-orphans 2>/dev/null \
            || true
        cd /
        echo '  -> Removing ${OLD_REMOTE_DIR}...'
        sudo rm -rf ${OLD_REMOTE_DIR}
        echo '  -> Old deployment removed.'
    else
        echo '  -> No old Book-AI deployment found, skipping.'
    fi
"

# 1. Ensure target dir exists, then sync code.
echo "[1/4] Syncing code to ${REMOTE_DIR}..."
ssh ${SSH_OPTS} ${SERVER} "sudo mkdir -p ${REMOTE_DIR} && sudo chown -R ec2-user:ec2-user ${REMOTE_DIR}"

rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.turbo' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='*.tsbuildinfo' \
    --exclude='.superpowers' \
    --exclude='.claude' \
    --exclude='backups' \
    --exclude='011-detail' \
    --exclude='012-detail-scroll' \
    --exclude='026-detail-scrolled' \
    --exclude='detail-scroll' \
    --exclude='*.png' \
    --exclude='apps/admin/.env.local' \
    --exclude='apps/admin/.env' \
    --exclude='apps/worker/.env.local' \
    --exclude='apps/worker/.env' \
    -e "ssh ${SSH_OPTS}" \
    ./ ${SERVER}:${REMOTE_DIR}/

# 2. Build images.
echo "[2/5] Building images..."
ssh ${SSH_OPTS} ${SERVER} "cd ${REMOTE_DIR} && docker compose ${COMPOSE_FILES} build --parallel"

# 3. Bring up Postgres + apply Prisma schema before starting app containers.
#    `db push` (no migration files) matches the local dev flow.
echo "[3/5] Starting Postgres + pushing Prisma schema..."
ssh ${SSH_OPTS} ${SERVER} "cd ${REMOTE_DIR} && \
    docker compose ${COMPOSE_FILES} up -d postgres && \
    docker compose ${COMPOSE_FILES} run --rm --no-deps \
        -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/coloring \
        -e DIRECT_URL=postgresql://postgres:postgres@postgres:5432/coloring \
        admin sh -c 'cd /app/packages/db && npx prisma db push --accept-data-loss --skip-generate'"

# 4. Start app containers.
echo "[4/5] Starting admin + worker..."
ssh ${SSH_OPTS} ${SERVER} "cd ${REMOTE_DIR} && docker compose ${COMPOSE_FILES} up -d"

# 5. Verify.
echo "[5/5] Waiting for services to start..."
sleep 8

echo "Verifying..."
ssh ${SSH_OPTS} ${SERVER} "curl -sf -o /dev/null http://localhost:3000/ && echo 'Admin OK (port 3000)' || echo 'Admin FAIL (port 3000)'"
ssh ${SSH_OPTS} ${SERVER} "cd ${REMOTE_DIR} && docker compose ${COMPOSE_FILES} ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"

echo ""
echo "=== Deploy complete ==="
echo "Admin: http://${SERVER#*@}:3000"
