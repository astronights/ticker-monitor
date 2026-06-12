# Ticker Monitor

Personal PWA for ETF & commodity trading signals: collects 15-minute and daily candles
into Supabase, backtests technical strategies (SMA/EMA cross, RSI, MACD, Bollinger) over
any window, and sends web-push notifications when a live buy/sell signal fires.

Data comes from Yahoo Finance's public chart API — **no API key needed**. Symbols use
Yahoo conventions, so non-US listings work too: `RELIANCE.BO` (BSE), `INFY.NS` (NSE),
`D05.SI` (SGX).

## Architecture

```
Supabase pg_cron (every 15 min, weekdays)
  └─ POST https://<app>.vercel.app/api/cron/fetch   (Bearer CRON_SECRET)
       ├─ fetches 15m + daily candles from Yahoo for tickers whose market is open
       ├─ upserts into Supabase `candles`
       └─ evaluates active alerts (15m or 1h bars) → web push on signal flip

Next.js PWA on Vercel
  ├─ /          dashboard: tickers, data freshness, add/remove, backfill
  ├─ /backtest  pick ticker + window + strategies → equity curves & stats
  └─ /live      live chart + current signal + create push alerts
```

## Setup (one time, ~15 minutes)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Database → Extensions**, enable `pg_cron` and `pg_net`.
3. Apply the schema, either way (the SQL is idempotent, so doing both is harmless):
   - **Manually:** in the **SQL editor**, run the whole of
     [`supabase/migrations/20260612000000_init.sql`](supabase/migrations/20260612000000_init.sql), or
   - **Via CI:** set the GitHub secrets from the CI/CD section below; merging to `main`
     applies any new files in `supabase/migrations/` automatically.

   Skip the commented cron block at the bottom for now — you need the Vercel URL first.
4. From **Project Settings → API**, note the **Project URL** and the
   **service_role key**.

### 2. VAPID keys (for push notifications)

```bash
npx web-push generate-vapid-keys
```

### 3. Vercel

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com) (defaults are fine).
2. Add the environment variables from [`.env.example`](.env.example):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSCODE`, `CRON_SECRET`
   (any long random string), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
3. Deploy.

### 4. Schedule collection

Back in the Supabase SQL editor, run the cron block from the bottom of
`supabase/migrations/20260612000000_init.sql` with your real Vercel URL and
`CRON_SECRET` filled in. It pings
the app every 15 minutes on weekdays; the app itself skips tickers whose home market
is closed, so one schedule covers US, India, and Singapore hours.

### 5. First run

1. Open the app, enter your passcode.
2. On the dashboard, hit **Backfill history (all)** — loads ~2 years of daily bars and
   ~60 days of 15-minute bars per ticker, so backtesting works immediately.
3. On your phone, open the site and **Add to Home Screen** (required for push on iOS),
   then on the Live page create an alert with **🔔 Watch** and accept the
   notification permission.

## CI/CD

Two GitHub Actions workflows (`.github/workflows/`):

- **`ci.yml`** — on every PR to `main` (and pushes to `main`): installs deps, builds
  the app (type-check + lint), and runs the strategy-engine sanity tests (`npm test`).
  Make it required: GitHub repo → Settings → Branches → add a branch protection rule
  for `main` requiring the **build-and-test** check.
- **`migrate.yml`** — on pushes to `main` that touch `supabase/migrations/`: applies
  pending migrations to your Supabase project with `supabase db push`. Needs three
  repository secrets (GitHub repo → Settings → Secrets and variables → Actions):
  - `SUPABASE_ACCESS_TOKEN` — personal access token from
    [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
  - `SUPABASE_PROJECT_ID` — the project ref (the subdomain in your project URL)
  - `SUPABASE_DB_PASSWORD` — the database password you chose at project creation

Future schema changes go in as new timestamped files in `supabase/migrations/` and
apply themselves on merge.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

Trigger a collection cycle manually:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/fetch
```

## Notes

- **Strategies** live in `src/lib/strategies.ts` — each is ~20 lines; add your own by
  pushing a new entry into the `STRATEGIES` array and it appears everywhere (backtest,
  live, alerts) automatically.
- **Backtest model:** long-only, all-in/all-out at bar close, 5 bps fee per side.
- **Yahoo intraday limit:** 15m history only goes back ~60 days, which is why the
  collector matters — your intraday archive grows past that limit from day one.
- This tool produces *signals*, not trades — execution is always manual. Check your
  employer's personal-trading policy.
