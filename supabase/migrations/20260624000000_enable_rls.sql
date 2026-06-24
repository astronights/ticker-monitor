-- Lock down all public tables with Row Level Security.
--
-- The app NEVER talks to Supabase from the browser: every query goes through a
-- Next.js API route using the service-role key, which bypasses RLS. So we enable
-- RLS on every table and add NO policies. The effect: the auto-generated public
-- REST/GraphQL API (anon + authenticated roles) can read/write nothing, while
-- the server keeps full access via the service-role key.
--
-- This clears the Supabase "RLS disabled in public" / "table is not secure"
-- advisor warnings. If you ever add client-side Supabase access with the anon
-- key, you'll need to add explicit policies for the rows that should be exposed.

alter table tickers            enable row level security;
alter table candles            enable row level security;
alter table alerts             enable row level security;
alter table signals            enable row level security;
alter table push_subscriptions enable row level security;
