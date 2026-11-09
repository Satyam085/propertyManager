# Property Manager

Tenants, rent, deposits, electricity, maintenance and expenses across your properties. It's a single-owner, installable PWA that works offline.

The stack is TanStack Start (React, file routes, SSR plus streaming) on Cloudflare Workers, with D1 for the database and R2 for files. The toolchain is `vp` (vite-plus) with pnpm.

## Develop

```sh
vp install
vp run db:migrate:local      # create the local D1 tables
vp dev                       # http://localhost:3000
```

The local password is `APP_PASSWORD` in `.dev.vars`, which is gitignored. To start over with an empty database, run `rm -rf .wrangler/state && vp run db:migrate:local`.

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `vp check`          | format, lint and type check                                           |
| `vp test`           | unit tests (`src/**/*.test.ts`)                                       |
| `vp run db:gen`     | generate a migration after editing `src/server/schema.server.ts`      |
| `vp run cf-typegen` | regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |

## Deploy (Cloudflare)

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create property-manager      # paste the database_id into wrangler.jsonc
pnpm exec wrangler r2 bucket create property-manager-files
pnpm exec wrangler secret put APP_PASSWORD         # a long passphrase
pnpm exec wrangler secret put SESSION_SECRET       # e.g. `openssl rand -hex 32`
vp run db:migrate:remote
vp run deploy
```

## How it fits together

- **`src/server.ts`**: the Worker entry and the only auth gate. Every request except `/login` and `/api/login` needs the signed session cookie.
- **`src/server/*.server.ts`**: server-only code (D1, R2, auth, ledger rules). Import protection fails the build if client code imports these files.
- **`src/fns/read.functions.ts`** (GET) and **`src/fns/write.functions.ts`** (POST): typed server functions with zod validation. The UI only talks to the server through these.
- **`src/routes/`**: file routes. Each route picks its SSR mode:
  - Most routes use full SSR.
  - `/` and `/reports` stream their slower sections.
  - `/record` uses `data-only` because it reads the browser's online state and queue.
  - `/sync` uses `ssr: false` because its data lives only in localStorage.
- **Ledger:** money is integer paise. Rent and maintenance charges are raised idempotently when the app loads, and a unique index stops duplicates. Rent balance = rent, maintenance and other charges − rent payments.
- **Electricity:** bills are entered by amount each month (no meter readings). They have their own balance and are never counted as income, whether the tenant pays the utility directly or pays through you.
- **Rooms:** a room (for example `2325`) can hold several tenants, each with a suffix (`2325 A`, `2325 B`). A partial unique index keeps active suffixes distinct within a room.
- **Offline:**
  - `public/sw.js` caches pages and GET server-function responses (network-first), plus assets and files (cache-first).
  - `src/lib/outbox.ts` queues payments, charges, readings and expenses made offline and replays them when you're back online. Client-generated IDs make a replay a no-op.
- **Design:** NeoPop-inspired tokens in `src/styles.css`, including the `plunk` 3px skewed edge, and components in `src/components/pop.tsx`.
