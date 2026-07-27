FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY tooling tooling
COPY packages packages
COPY apps/admin/package.json apps/admin/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN yarn install --immutable

# --- build ---
FROM base AS build
COPY --from=deps /app /app
COPY apps/admin apps/admin
# NEXT_PUBLIC_* are inlined at build time. Default 0 (writes gated); prod sets 1
# via docker-compose.prod.yml build args to enable real write actions.
ARG NEXT_PUBLIC_COLORING_WRITE=0
ENV NEXT_PUBLIC_COLORING_WRITE=$NEXT_PUBLIC_COLORING_WRITE
RUN yarn workspace @vx/db prisma generate
RUN yarn workspace @vx/admin build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/admin
EXPOSE 3000
# Sync Prisma schema to DB on every start, then launch Next.
# `db push` is idempotent — safe to re-run. Matches the flow used in deploy.sh.
CMD ["sh", "-c", "cd /app/packages/db && npx prisma db push --accept-data-loss --skip-generate && cd /app/apps/admin && yarn start"]
