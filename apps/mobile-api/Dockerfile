FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY tooling tooling
COPY packages packages
# Yarn workspace install resolves ALL workspaces (apps/*), so every app's
# package.json must be present or --immutable sees a different workspace set
# than yarn.lock was generated with and aborts (YN0028).
COPY apps/admin/package.json apps/admin/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/mobile-api/package.json apps/mobile-api/package.json
COPY apps/motion/package.json apps/motion/package.json
RUN yarn install --immutable

# --- build ---
FROM base AS build
COPY --from=deps /app /app
COPY apps/mobile-api apps/mobile-api
RUN yarn workspace @vx/db prisma generate

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/mobile-api
EXPOSE 3001
CMD ["node", "--import", "@swc-node/register/esm-register", "src/main.ts"]
