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
COPY apps/mobile-api/package.json apps/mobile-api/package.json
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
