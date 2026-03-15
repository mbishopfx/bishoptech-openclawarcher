# bishoptech-openclawarcher

OpenClaw Agent Command Center monorepo:
- `apps/web` → Vercel-hosted frontend (Next.js + 3D command center UI)
- `apps/api` → Railway-hosted backend (Express + Supabase)
- `supabase/schema.sql` → DB schema + RLS policies
- `AGENT_API_EXAMPLES.md` → fetch/report snippets for OpenClaw cron jobs

## Core Features (MVP)

- Multi-bucket/topic workspace with per-bucket agent endpoint keys
- Ingest raw text or shared chat URLs (URL scraping + normalization on backend)
- Agent fetch endpoint for queued work
- Agent report endpoint for status/progress/completion logs
- System log dashboard polling every 5 minutes
- Cyberpunk 3D isometric agent room UI with animated robot fleet simulation

## Quick Start

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Grab:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Set those in `apps/api/.env`.

RLS is enabled with full authenticated access policies for team users.

## Deploy

### Railway (API)
- Create new project from this GitHub repo.
- Service root: `apps/api`
- Start command: `npm run start -w apps/api`
- Add env vars from `apps/api/.env.example`

### Vercel (Web)
- Import same repo.
- Root directory: `apps/web`
- Env var: `NEXT_PUBLIC_API_BASE_URL=https://<your-railway-domain>`

## API Endpoints

- `GET /api/buckets`
- `POST /api/buckets`
- `POST /api/buckets/:bucketId/ingest`
- `GET /api/agent/fetch/:endpointKey`
- `POST /api/agent/report`
- `GET /api/logs?bucketId=<uuid>`

