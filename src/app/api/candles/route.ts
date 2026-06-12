import { NextRequest, NextResponse } from 'next/server';
import { aggregateToHourly } from '@/lib/aggregate';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Candle } from '@/lib/types';

/** GET /api/candles?ticker_id=1&interval=15m|1h|1d&from=ISO&to=ISO */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tickerId = Number(q.get('ticker_id'));
  const interval = q.get('interval') ?? '1d';
  if (!tickerId) return NextResponse.json({ error: 'ticker_id required' }, { status: 400 });

  // 1h is derived from stored 15m bars.
  const storedInterval = interval === '1h' ? '15m' : interval;
  let query = supabaseAdmin()
    .from('candles')
    .select('ts,o,h,l,c,v')
    .eq('ticker_id', tickerId)
    .eq('interval', storedInterval)
    .order('ts');
  const from = q.get('from');
  const to = q.get('to');
  if (from) query = query.gte('ts', from);
  if (to) query = query.lte('ts', to);

  const { data, error } = await query.limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let candles: Candle[] = (data ?? []).map((r) => ({
    ts: Math.floor(new Date(r.ts).getTime() / 1000),
    o: r.o, h: r.h, l: r.l, c: r.c, v: r.v,
  }));
  if (interval === '1h') candles = aggregateToHourly(candles);
  return NextResponse.json(candles);
}
