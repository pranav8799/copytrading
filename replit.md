# Copy Trading Admin Panel

A full-stack web app where an admin connects multiple CoinSwitch broker accounts and fires futures trades simultaneously across all accounts. Supports manual execution and TradingView webhook automation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `COINSWITCH_BASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifact: `copy-trading`, port 18990, path `/`)
- API: Express 5 (artifact: `api-server`, port 8080, path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/db/src/schema/` — Drizzle schema files (accounts, trade_logs, webhooks, webhook_logs, system_logs, settings)
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/api-server/src/lib/` — Utilities: crypto.ts, signRequest.ts, auth.ts, coinswitchApi.ts
- `artifacts/copy-trading/src/pages/` — All 10 frontend pages
- `lib/api-client-react/src/generated/` — Auto-generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Auto-generated Zod schemas (do not edit)

## Architecture decisions

- **CoinSwitch signing**: All API calls use HMAC-SHA256 over `method + path + epoch`. Exchange ID is always `EXCHANGE_2`.
- **API key storage**: AES-256-CBC encrypted in DB, decrypted in-memory only at execution time. ENCRYPTION_KEY must be a 64-char hex string (32 bytes).
- **Rate limiting**: Trade batching is 18 accounts per batch, 3.1s delay between batches (CoinSwitch limit: 20 req/min).
- **Error resilience**: Always `Promise.allSettled` (never `Promise.all`) for multi-account operations.
- **Auth**: Single admin password, validated against `ADMIN_PASSWORD` env var. JWT issued on login, stored in `localStorage` as `ct_token`.

## Product

- **Dashboard**: Overview stats (accounts, positions, total P&L), account summaries, recent trade executions
- **Trade Execution**: Fire buy/sell orders simultaneously across multiple selected accounts
- **Positions**: Live view of open futures positions across all accounts (auto-refreshes every 10s)
- **Orders**: Open and closed order tables with cancel functionality
- **P&L**: Realised P&L tracker with per-account breakdown and Recharts line chart
- **TP/SL**: Set or cancel take-profit/stop-loss orders across accounts
- **Accounts**: Manage broker API credentials (add/edit/delete/verify)
- **Webhooks**: Create TradingView webhook endpoints that auto-fire trades on signal
- **Logs**: Trade logs, webhook execution logs, system logs
- **Settings**: Default leverage, order type, webhook master switch

## Gotchas

- After changing DB schema, always run `pnpm --filter @workspace/db run push` then restart the api-server workflow.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` — this also rebuilds libs.
- After changing any `lib/*` package, run `pnpm run typecheck:libs` before leaf package checks.
- Design subagent tends to import from `@workspace/api-client-react/src/custom-fetch` or `/src/generated/api.schemas` — fix to `@workspace/api-client-react` (everything is re-exported from the main index).
- ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
