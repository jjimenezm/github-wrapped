# syntax=docker/dockerfile:1
# The api (NestJS 11 + Prisma), built from the repository root:
#   docker build -f apps/api/Dockerfile -t wrapped-api .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Prisma's engines link against OpenSSL, which slim images leave out.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS build
# No .git in the image, so Husky has no hooks to install.
ENV HUSKY=0 CI=true
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm at the exact version of the root package.json `packageManager` field.
RUN corepack enable && corepack install
# Dependencies download from the lockfile alone, so this layer survives source changes.
RUN pnpm fetch --store-dir /pnpm-store
COPY . .
RUN pnpm install --offline --frozen-lockfile --store-dir /pnpm-store --filter "@wrapped/api..."
RUN pnpm --filter "@wrapped/api..." build
# Production dependencies only, with @wrapped/shared copied in instead of linked. The Prisma
# client is generated against that copy, for this image's platform.
RUN pnpm --filter @wrapped/api deploy --legacy --prod --store-dir /pnpm-store /out \
  && cd /out && ./node_modules/.bin/prisma generate

FROM base AS runtime
# tini as PID 1: forwards SIGTERM for a graceful shutdown and reaps Prisma's engine processes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    FILES_DIR=/data/files
WORKDIR /app
# The shared files volume mounts here; an empty named volume takes this owner, so `node` can write.
RUN mkdir -p /data/files && chown node:node /data/files
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/prisma ./prisma
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3000
# Postgres and Redis must answer; migrations get a minute before the first check counts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["tini", "--"]
# Pending migrations first (Prisma takes a lock, so two starting instances never race), then
# the server; `exec` hands it PID 2 under tini so it receives the signals.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
