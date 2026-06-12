import type { Candle } from './types';

/** Aggregate 15m candles into 1h candles (UTC hour buckets). Input must be sorted by ts. */
export function aggregateToHourly(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of candles) {
    const bucket = Math.floor(c.ts / 3600) * 3600;
    if (cur && cur.ts === bucket) {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    } else {
      if (cur) out.push(cur);
      cur = { ts: bucket, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
    }
  }
  if (cur) out.push(cur);
  return out;
}
