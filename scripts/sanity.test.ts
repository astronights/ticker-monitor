/** Strategy-engine sanity tests, run in CI via `npx tsx scripts/sanity.test.ts`. */
import assert from 'node:assert/strict';
import { sma, ema, rsi, atr } from '../src/lib/indicators';
import { backtest } from '../src/lib/backtest';
import { aggregateToHourly } from '../src/lib/aggregate';
import { STRATEGIES, defaultParams, paramGrid } from '../src/lib/strategies';
import type { Candle } from '../src/lib/types';

// --- indicators ---
const s = sma([1, 2, 3, 4, 5], 3);
assert.ok(Number.isNaN(s[1]));
assert.equal(s[2], 2);
assert.equal(s[4], 4);

const e = ema([1, 2, 3, 4, 5, 6], 3);
assert.ok(Number.isNaN(e[1]));
assert.ok(Math.abs(e[2] - 2) < 1e-9);

const r = rsi(Array.from({ length: 20 }, (_, i) => 100 + i), 14);
assert.equal(r[19], 100, 'RSI of a monotonic rise should be 100');

const atrArr = atr(
  Array.from({ length: 20 }, () => 105),
  Array.from({ length: 20 }, () => 95),
  Array.from({ length: 20 }, () => 100),
  14
);
assert.ok(Number.isNaN(atrArr[13]), 'ATR warm-up period');
assert.ok(atrArr[14] > 0, 'ATR positive after warm-up');

// --- aggregation: four 15m bars in one hour -> one 1h bar ---
const m15: Candle[] = [0, 900, 1800, 2700].map((off, i) => ({
  ts: 3_600_000 + off, o: 10 + i, h: 12 + i, l: 9 + i, c: 11 + i, v: 5,
}));
const h1 = aggregateToHourly(m15);
assert.equal(h1.length, 1);
assert.deepEqual(
  { o: h1[0].o, h: h1[0].h, l: h1[0].l, c: h1[0].c, v: h1[0].v },
  { o: 10, h: 15, l: 9, c: 14, v: 20 }
);

// --- backtest: every strategy runs end-to-end on synthetic data ---
const candles: Candle[] = Array.from({ length: 300 }, (_, i) => {
  const price = 100 + i * 0.5 + 10 * Math.sin(i / 15);
  return { ts: 1_700_000_000 + i * 86_400, o: price, h: price + 1, l: price - 1, c: price, v: 1000 };
});
for (const def of STRATEGIES) {
  const res = backtest(def.key, candles, defaultParams(def), '1d');
  assert.equal(res.equity.length, candles.length, `${def.key}: equity curve length`);
  assert.ok(Number.isFinite(res.stats.totalReturnPct), `${def.key}: finite return`);
  assert.ok(res.stats.maxDrawdownPct >= 0 && res.stats.maxDrawdownPct <= 100, `${def.key}: drawdown bounds`);
}
// --- grid search: every combo is valid and runs ---
let totalCombos = 0;
for (const def of STRATEGIES) {
  const combos = paramGrid(def);
  assert.ok(combos.length >= 1, `${def.key}: has combos`);
  for (const p of combos) {
    if ('fast' in p && 'slow' in p) assert.ok(p.fast < p.slow, `${def.key}: fast<slow`);
    const res = backtest(def.key, candles, p, '1d');
    assert.ok(Number.isFinite(res.stats.totalReturnPct), `${def.key} grid combo runs`);
  }
  totalCombos += combos.length;
}
console.log(`grid search space: ${totalCombos} parameter combos across ${STRATEGIES.length} strategies`);

const trend = backtest('sma_cross', candles, { fast: 10, slow: 30 }, '1d');
assert.ok(trend.stats.trades > 0, 'sma_cross should trade on an oscillating trend');
assert.ok(trend.stats.totalReturnPct > 0, 'sma_cross should profit on a rising trend');

console.log('All sanity checks passed');
