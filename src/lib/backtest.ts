import { runStrategy, getStrategy } from './strategies';
import type { BacktestResult, Candle } from './types';

const BARS_PER_YEAR: Record<string, number> = { '1d': 252, '1h': 252 * 7, '15m': 252 * 26 };

/**
 * Long-only, all-in/all-out backtest. A signal computed on bar i is executed at
 * the close of bar i (signals only use data up to and including bar i).
 */
export function backtest(
  strategyKey: string,
  candles: Candle[],
  params: Record<string, number>,
  interval: string,
  feeBps = 5
): BacktestResult {
  const signals = runStrategy(strategyKey, candles, params);
  const fee = feeBps / 10_000;

  let equity = 1;
  let pos: 'long' | 'flat' = 'flat';
  let entryEquity = 1;
  const curve: { ts: number; value: number }[] = [];
  const markers: BacktestResult['markers'] = [];
  let trades = 0;
  let wins = 0;
  const barReturns: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const prevEquity = equity;
    if (pos === 'long' && i > 0) {
      equity *= candles[i].c / candles[i - 1].c;
    }
    if (signals[i] !== pos) {
      equity *= 1 - fee;
      if (signals[i] === 'long') {
        entryEquity = equity;
        markers.push({ ts: candles[i].ts, side: 'buy', price: candles[i].c });
      } else {
        trades++;
        if (equity > entryEquity) wins++;
        markers.push({ ts: candles[i].ts, side: 'sell', price: candles[i].c });
      }
      pos = signals[i];
    }
    barReturns.push(prevEquity > 0 ? equity / prevEquity - 1 : 0);
    curve.push({ ts: candles[i].ts, value: equity });
  }
  // Close any open trade for win-rate accounting.
  if (pos === 'long' && candles.length) {
    trades++;
    if (equity > entryEquity) wins++;
  }

  const buyHold = candles.length > 1 ? candles[candles.length - 1].c / candles[0].c : 1;
  const mean = barReturns.reduce((a, b) => a + b, 0) / Math.max(barReturns.length, 1);
  const variance =
    barReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(barReturns.length - 1, 1);
  const sd = Math.sqrt(variance);
  const annualize = Math.sqrt(BARS_PER_YEAR[interval] ?? 252);
  const sharpe = sd > 0 ? (mean / sd) * annualize : 0;

  let peak = 0;
  let maxDd = 0;
  for (const pt of curve) {
    peak = Math.max(peak, pt.value);
    maxDd = Math.max(maxDd, 1 - pt.value / peak);
  }

  return {
    strategy: strategyKey,
    label: getStrategy(strategyKey)?.label ?? strategyKey,
    equity: curve,
    markers,
    stats: {
      totalReturnPct: (equity - 1) * 100,
      buyHoldReturnPct: (buyHold - 1) * 100,
      maxDrawdownPct: maxDd * 100,
      trades,
      winRatePct: trades > 0 ? (wins / trades) * 100 : 0,
      sharpe,
    },
  };
}
