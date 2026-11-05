# syntax=docker/dockerfile:1
# The renderer (BullMQ worker: PNG cards with resvg), built from the repository root:
#   docker build -f apps/renderer/Dockerfile -t wrapped-renderer .

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
# The api comes along: the renderer's postinstall generates its Prisma client from the api's schema.
RUN pnpm install --offline --frozen-lockfile --store-dir /pnpm-store \
  --filter "@wrapped/renderer..." --filter @wrapped/api
RUN pnpm --filter "@wrapped/renderer..." build
# Production dependencies only, with @wrapped/art and @wrapped/shared copied in instead of linked.
# The worker reads the api's schema, so its Prisma client is generated from a copy of it, against
# the deployed @prisma/client and for this image's platform.
RUN pnpm --filter @wrapped/renderer deploy --legacy --prod --store-dir /pnpm-store /out \
  && mkdir -p /out/prisma \
  && cp apps/api/prisma/schema.prisma /out/prisma/schema.prisma \
  && apps/renderer/node_modules/.bin/prisma generate --schema /out/prisma/schema.prisma

FROM base AS runtime
# tini as PID 1: forwards SIGTERM so the worker finishes its job, and reaps child processes
# (the video renders of phase 2 start Chrome and FFmpeg).
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3001 \
    FILES_DIR=/data/files \
    REQUIRE_FILES_VOLUME=true
WORKDIR /app
# The shared files volume mounts here; an empty named volume takes this owner, so `node` can write.
# Without the mount, the health check fails: PNGs written to the container layer never reach the api.
RUN mkdir -p /data/files && chown node:node /data/files
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/assets ./assets
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
