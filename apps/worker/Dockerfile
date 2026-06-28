FROM node:20-alpine
WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY tooling tooling
COPY packages packages
COPY apps/worker apps/worker

RUN yarn install --immutable
RUN yarn workspace @vx/worker build

CMD ["yarn", "workspace", "@vx/worker", "start"]
