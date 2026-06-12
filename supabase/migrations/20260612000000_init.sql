-- Ticker Monitor: run this whole file in the Supabase SQL editor (once).

create table if not exists tickers (
  id bigint generated always as identity primary key,
  symbol text not null unique,            -- Yahoo symbol, e.g. INDA, RELIANCE.BO, D05.SI
  name text not null default '',
  exchange text not null default 'NYSEARCA',
  timezone text not null default 'America/New_York',
  market_open text not null default '09:30',  -- HH:MM local to `timezone`
  market_close text not null default '16:00',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists candles (
  ticker_id bigint not null references tickers(id) on delete cascade,
  interval text not null,                 -- '15m' | '1d'
  ts timestamptz not null,                -- bar open time (UTC)
  o double precision not null,
  h double precision not null,
  l double precision not null,
  c double precision not null,
  v double precision not null default 0,
  primary key (ticker_id, interval, ts)
);
create index if not exists candles_lookup on candles (ticker_id, interval, ts desc);

-- Live alert configs: which ticker+strategy combos to watch.
create table if not exists alerts (
  id bigint generated always as identity primary key,
  ticker_id bigint not null references tickers(id) on delete cascade,
  strategy text not null,                 -- key in the strategy registry
  params jsonb not null default '{}',
  signal_interval text not null default '1h',  -- '15m' | '1h'
  active boolean not null default true,
  last_signal text,                       -- 'long' | 'flat' (last evaluated state)
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);

-- Log of every fired signal, so you can audit performance of the alerts you follow.
create table if not exists signals (
  id bigint generated always as identity primary key,
  alert_id bigint references alerts(id) on delete set null,
  ticker_id bigint not null references tickers(id) on delete cascade,
  strategy text not null,
  side text not null,                     -- 'buy' | 'sell'
  price double precision not null,
  bar_ts timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- Seed the starting universe (all US-listed ETFs).
insert into tickers (symbol, name) values
  ('INDA', 'iShares MSCI India'),
  ('EPI',  'WisdomTree India Earnings'),
  ('ACWI', 'iShares MSCI ACWI'),
  ('XLF',  'Financial Select Sector SPDR'),
  ('IXJ',  'iShares Global Healthcare'),
  ('QQQM', 'Invesco NASDAQ 100'),
  ('SLV',  'iShares Silver Trust'),
  ('IAU',  'iShares Gold Trust')
on conflict (symbol) do nothing;

-- ---------------------------------------------------------------------------
-- Scheduler: every 15 minutes on weekdays, ping the Vercel app to collect data
-- and evaluate alerts. The app itself decides which markets are open.
--
-- 1. Enable the pg_cron and pg_net extensions (Database -> Extensions), then:
-- 2. REPLACE the URL and the secret below before running.
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'fetch-prices',
--   '*/15 * * * 1-5',
--   $$
--   select net.http_post(
--     url := 'https://YOUR-APP.vercel.app/api/cron/fetch',
--     headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
