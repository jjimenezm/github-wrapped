# syntax=docker/dockerfile:1
# The web (Angular 21, server-rendered public pages), built from the repository root:
#   docker build -f apps/web/Dockerfile -t wrapped-web .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
# No .git in the image, so Husky has no hooks to install.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HUSKY=0 CI=true
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm at the exact version of the root package.json `packageManager` field.
RUN corepack enable && corepack install
# Dependencies download from the lockfile alone, so this layer survives source changes.
RUN pnpm fetch --store-dir /pnpm-store
COPY . .
RUN pnpm install --offline --frozen-lockfile --store-dir /pnpm-store --filter "@wrapped/web..."
RUN pnpm --filter "@wrapped/web..." build

FROM ${NODE_IMAGE} AS runtime
# Traefik adds these headers to every request. Angular SSR silently falls back to client-side
# rendering (no HTML, so no link preview) when a request carries one it doesn't trust; the host is
# still checked against angular.json `allowedHosts`.
ENV NODE_ENV=production \
    PORT=4000 \
    NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-host,x-forwarded-port,x-forwarded-proto,x-forwarded-server
WORKDIR /app
# The server bundle carries its dependencies (Express and Angular included): no node_modules.
COPY --from=build /repo/apps/web/dist/web ./dist/web
USER node
EXPOSE 4000
# `localhost` is one of the hosts the server accepts (angular.json `allowedHosts`).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + (process.env.PORT || 4000) + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/web/server/server.mjs"]
