# syntax=docker/dockerfile:1
# The renderer (BullMQ worker: PNG cards with resvg, 30-second videos with HyperFrames), built
# from the repository root:
#   docker build -f apps/renderer/Dockerfile -t wrapped-renderer .
# The video tools are pinned to what was measured on the server: HyperFrames 0.9.16, the
# chrome-headless-shell it pins, and FFmpeg n8.0.1.

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
# The video composition loads GSAP and the art's browser bundle from its vendor/ folder (not in
# git): copied from node_modules here, so a render never reaches for a CDN.
RUN pnpm --filter @wrapped/renderer composition:vendor
# Production dependencies only, with @wrapped/art and @wrapped/shared copied in instead of linked.
# The worker reads the api's schema, so its Prisma client is generated from a copy of it, against
# the deployed @prisma/client and for this image's platform.
RUN pnpm --filter @wrapped/renderer deploy --legacy --prod --store-dir /pnpm-store /out \
  && mkdir -p /out/prisma \
  && cp apps/api/prisma/schema.prisma /out/prisma/schema.prisma \
  && apps/renderer/node_modules/.bin/prisma generate --schema /out/prisma/schema.prisma

# FFmpeg 8.0.1, the static build and checksum HyperFrames pins (amd64), fetched apart so the
# download tools stay out of the runtime image.
FROM base AS ffmpeg
ARG FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-02-28-12-59/ffmpeg-n8.0.1-66-g27b8d1a017-linux64-gpl-8.0.tar.xz
ARG FFMPEG_SHA256=26d2ecd0cefba99f9d1ea92252a3a4f743a58df4c1c3cf9f8bbaaa40b1fca5b0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && wget -q -O /tmp/ffmpeg.tar.xz "$FFMPEG_URL" \
  && echo "$FFMPEG_SHA256  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
  && mkdir -p /ffmpeg \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /ffmpeg --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' \
  && rm /tmp/ffmpeg.tar.xz

FROM base AS runtime
# tini as PID 1: forwards SIGTERM so the worker finishes its job, and reaps child processes (the
# video renders start Chrome and FFmpeg). Then chrome-headless-shell's shared libraries (the set
# HyperFrames' reference image installs) and fallback fonts; the compositions embed Geist.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
      fonts-dejavu-core fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 \
      libfontconfig1 libfreetype6 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
      libpangocairo-1.0-0 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
      libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ffmpeg /ffmpeg/ /usr/local/bin/
ARG HYPERFRAMES_VERSION=0.9.16
ENV HYPERFRAMES_NO_TELEMETRY=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1
RUN npm install --global "hyperframes@${HYPERFRAMES_VERSION}" && npm cache clean --force
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
# The HyperFrames project, vendor/ included; each render copies it into its own work folder.
# Its assets/ is a link to ../../assets, the fonts above.
COPY --from=build /repo/apps/renderer/compositions/wrap ./compositions/wrap
USER node
# The Chrome build HyperFrames pins, downloaded once into the image: renders need no network.
RUN hyperframes browser ensure && hyperframes browser path
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
