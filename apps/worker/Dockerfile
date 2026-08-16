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
COPY apps/mobile-api/package.json apps/mobile-api/package.json
RUN yarn install --immutable

# --- build ---
FROM base AS build
COPY --from=deps /app /app
# Worker source pulls in admin's lib helpers via relative imports — must copy admin src.
COPY apps/admin/src apps/admin/src
COPY apps/admin/tsconfig.json apps/admin/tsconfig.json
COPY apps/worker apps/worker
RUN yarn workspace @vx/db prisma generate
RUN yarn workspace @vx/worker build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "--env-file=.env", "--import", "tsx", "src/index.ts"]
