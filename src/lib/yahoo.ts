import type { Candle } from './types';

/**
 * Thin client for Yahoo Finance's public chart API (no key required).
 * Symbols use Yahoo conventions: INDA, RELIANCE.BO (BSE), D05.SI (SGX), GC=F (futures).
 */
export async function fetchYahooCandles(
  symbol: string,
  interval: '15m' | '1h' | '1d',
  range: string
): Promise<Candle[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ticker-monitor/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${interval}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: ${json?.chart?.error?.description ?? 'no data'}`);

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // skip partial bars
    candles.push({ ts: ts[i], o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  return candles;
}
