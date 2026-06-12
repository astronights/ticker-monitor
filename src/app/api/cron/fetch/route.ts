import { NextRequest, NextResponse } from 'next/server';
import { aggregateToHourly } from '@/lib/aggregate';
import { isMarketOpen } from '@/lib/marketHours';
import { sendPushToAll } from '@/lib/push';
import { runStrategy } from '@/lib/strategies';
import { supabaseAdmin, upsertCandles } from '@/lib/supabaseAdmin';
import type { Candle, Ticker } from '@/lib/types';
import { fetchYahooCandles } from '@/lib/yahoo';

export const maxDuration = 60;

const INTERVAL_SECONDS: Record<string, number> = { '15m': 900, '1h': 3600 };

/** Drop the final bar if it is still in progress. */
function completedBars(candles: Candle[], interval: string): Candle[] {
  const span = INTERVAL_SECONDS[interval] ?? 86400;
  const last = candles[candles.length - 1];
  if (last && Date.now() / 1000 < last.ts + span) return candles.slice(0, -1);
  return candles;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data: tickers, error } = await sb.from('tickers').select('*').eq('active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const open = (tickers as Ticker[]).filter((t) => isMarketOpen(t));
  const fetched: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    open.map(async (t) => {
      try {
        const [intraday, daily] = await Promise.all([
          fetchYahooCandles(t.symbol, '15m', '1d'),
          fetchYahooCandles(t.symbol, '1d', '5d'),
        ]);
        await upsertCandles(t.id, '15m', intraday);
        await upsertCandles(t.id, '1d', daily);
        fetched.push(t.symbol);
      } catch {
        failed.push(t.symbol);
      }
    })
  );

  // Evaluate active alerts for tickers whose market is open.
  const { data: alerts } = await sb
    .from('alerts')
    .select('*, tickers(*)')
    .eq('active', true);
  const notified: string[] = [];

  for (const alert of alerts ?? []) {
    const ticker = alert.tickers as Ticker;
    if (!ticker || !isMarketOpen(ticker)) continue;
    try {
      const since = new Date(Date.now() - 35 * 86400_000).toISOString();
      const { data: rows } = await sb
        .from('candles')
        .select('ts,o,h,l,c,v')
        .eq('ticker_id', ticker.id)
        .eq('interval', '15m')
        .gte('ts', since)
        .order('ts');
      let candles: Candle[] = (rows ?? []).map((r) => ({
        ts: Math.floor(new Date(r.ts).getTime() / 1000),
        o: r.o, h: r.h, l: r.l, c: r.c, v: r.v,
      }));
      if (alert.signal_interval === '1h') candles = aggregateToHourly(candles);
      candles = completedBars(candles, alert.signal_interval);
      if (candles.length < 30) continue;

      const signals = runStrategy(alert.strategy, candles, alert.params ?? {});
      const current = signals[signals.length - 1];
      const lastBar = candles[candles.length - 1];

      if (alert.last_signal && current !== alert.last_signal) {
        const side = current === 'long' ? 'buy' : 'sell';
        await sb.from('signals').insert({
          alert_id: alert.id,
          ticker_id: ticker.id,
          strategy: alert.strategy,
          side,
          price: lastBar.c,
          bar_ts: new Date(lastBar.ts * 1000).toISOString(),
        });
        await sendPushToAll(
          `${ticker.symbol}: ${side.toUpperCase()} signal`,
          `${alert.strategy} (${alert.signal_interval}) at ${lastBar.c.toFixed(2)}`,
          `/live?ticker=${ticker.id}&strategy=${alert.strategy}`
        );
        notified.push(`${ticker.symbol}:${side}`);
      }
      if (current !== alert.last_signal) {
        await sb
          .from('alerts')
          .update({ last_signal: current, last_fired_at: new Date().toISOString() })
          .eq('id', alert.id);
      }
    } catch {
      // keep processing other alerts
    }
  }

  return NextResponse.json({ fetched, failed, skippedClosed: tickers.length - open.length, notified });
}
