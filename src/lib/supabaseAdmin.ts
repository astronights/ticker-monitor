import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Server-side Supabase client using the service-role key. Never import in client code. */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export async function upsertCandles(
  tickerId: number,
  interval: string,
  candles: { ts: number; o: number; h: number; l: number; c: number; v: number }[]
): Promise<void> {
  const sb = supabaseAdmin();
  const rows = candles.map((c) => ({
    ticker_id: tickerId,
    interval,
    ts: new Date(c.ts * 1000).toISOString(),
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('candles')
      .upsert(rows.slice(i, i + 500), { onConflict: 'ticker_id,interval,ts' });
    if (error) throw new Error(`upsert candles: ${error.message}`);
  }
}
