# github-wrapped

Your year on GitHub as story slides, a generative share card and a 30-second video, built from public data only.

> Work in progress. The full README (demo, decisions and trade-offs) lands with the first deploy.

## Workspace

| Path              | What it is                                                |
| ----------------- | --------------------------------------------------------- |
| `apps/web`        | Angular 21 app (SSR only for the public wrap page)        |
| `apps/api`        | NestJS 11 API: GitHub data, ownership and wrap lifecycle  |
| `apps/renderer`   | NestJS worker that renders images and videos from a queue |
| `packages/art`    | Generative card art as pure SVG functions                 |
| `packages/shared` | Domain types, year rule, ES/EN formatting and source URLs |
| `infra`           | Local Postgres and Redis for development                  |

## Run locally

```bash
nvm use
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d
pnpm build && pnpm test
```
