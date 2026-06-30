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
RUN yarn workspace @vx/db prisma generate
RUN yarn workspace @vx/admin build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/admin
EXPOSE 3000
CMD ["yarn", "start"]
