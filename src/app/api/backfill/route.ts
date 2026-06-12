import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, upsertCandles } from '@/lib/supabaseAdmin';
import { fetchYahooCandles } from '@/lib/yahoo';

export const maxDuration = 60;

/**
 * POST /api/backfill?ticker_id=1
 * Pulls ~2 years of daily bars and ~60 days of 15m bars (Yahoo's free intraday limit).
 * Called per ticker from the dashboard so each request stays fast.
 */
export async function POST(req: NextRequest) {
  const tickerId = Number(req.nextUrl.searchParams.get('ticker_id'));
  if (!tickerId) return NextResponse.json({ error: 'ticker_id required' }, { status: 400 });

  const { data: ticker, error } = await supabaseAdmin()
    .from('tickers')
    .select('*')
    .eq('id', tickerId)
    .single();
  if (error || !ticker) return NextResponse.json({ error: 'ticker not found' }, { status: 404 });

  try {
    const [daily, intraday] = await Promise.all([
      fetchYahooCandles(ticker.symbol, '1d', '2y'),
      fetchYahooCandles(ticker.symbol, '15m', '60d'),
    ]);
    await upsertCandles(ticker.id, '1d', daily);
    await upsertCandles(ticker.id, '15m', intraday);
    return NextResponse.json({ symbol: ticker.symbol, daily: daily.length, intraday: intraday.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
