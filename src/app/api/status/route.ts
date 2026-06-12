import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Per-ticker data freshness for the dashboard. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: tickers, error } = await sb.from('tickers').select('*').order('symbol');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status = await Promise.all(
    (tickers ?? []).map(async (t) => {
      const latest = async (interval: string) => {
        const { data } = await sb
          .from('candles')
          .select('ts')
          .eq('ticker_id', t.id)
          .eq('interval', interval)
          .order('ts', { ascending: false })
          .limit(1);
        return data?.[0]?.ts ?? null;
      };
      const { count } = await sb
        .from('candles')
        .select('ts', { count: 'exact', head: true })
        .eq('ticker_id', t.id);
      return { ...t, latest_15m: await latest('15m'), latest_1d: await latest('1d'), bars: count ?? 0 };
    })
  );
  return NextResponse.json(status);
}
