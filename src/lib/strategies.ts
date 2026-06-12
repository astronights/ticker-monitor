import { bollinger, ema, macd, rsi, sma } from './indicators';
import type { Candle, Signal, StrategyDef } from './types';

function crossSignals(fastArr: number[], slowArr: number[]): Signal[] {
  return fastArr.map((f, i) =>
    Number.isNaN(f) || Number.isNaN(slowArr[i]) ? 'flat' : f > slowArr[i] ? 'long' : 'flat'
  );
}

export const STRATEGIES: StrategyDef[] = [
  {
    key: 'sma_cross',
    label: 'SMA Crossover',
    params: [
      { key: 'fast', label: 'Fast period', default: 20, min: 2, max: 200 },
      { key: 'slow', label: 'Slow period', default: 50, min: 5, max: 400 },
    ],
    run: (candles, p) => {
      const closes = candles.map((c) => c.c);
      return crossSignals(sma(closes, p.fast), sma(closes, p.slow));
    },
  },
  {
    key: 'ema_cross',
    label: 'EMA Crossover',
    params: [
      { key: 'fast', label: 'Fast period', default: 12, min: 2, max: 200 },
      { key: 'slow', label: 'Slow period', default: 26, min: 5, max: 400 },
    ],
    run: (candles, p) => {
      const closes = candles.map((c) => c.c);
      return crossSignals(ema(closes, p.fast), ema(closes, p.slow));
    },
  },
  {
    key: 'rsi_reversion',
    label: 'RSI Mean Reversion',
    params: [
      { key: 'period', label: 'RSI period', default: 14, min: 2, max: 100 },
      { key: 'buyBelow', label: 'Buy below', default: 30, min: 5, max: 50 },
      { key: 'sellAbove', label: 'Sell above', default: 70, min: 50, max: 95 },
    ],
    run: (candles, p) => {
      const r = rsi(candles.map((c) => c.c), p.period);
      const out: Signal[] = [];
      let pos: Signal = 'flat';
      for (let i = 0; i < r.length; i++) {
        if (!Number.isNaN(r[i])) {
          if (pos === 'flat' && r[i] < p.buyBelow) pos = 'long';
          else if (pos === 'long' && r[i] > p.sellAbove) pos = 'flat';
        }
        out.push(pos);
      }
      return out;
    },
  },
  {
    key: 'macd_cross',
    label: 'MACD Cross',
    params: [
      { key: 'fast', label: 'Fast EMA', default: 12, min: 2, max: 100 },
      { key: 'slow', label: 'Slow EMA', default: 26, min: 5, max: 200 },
      { key: 'signal', label: 'Signal period', default: 9, min: 2, max: 50 },
    ],
    run: (candles, p) => {
      const { macd: m, signal: s } = macd(candles.map((c) => c.c), p.fast, p.slow, p.signal);
      return crossSignals(m, s);
    },
  },
  {
    key: 'bollinger_reversion',
    label: 'Bollinger Reversion',
    params: [
      { key: 'period', label: 'Period', default: 20, min: 5, max: 100 },
      { key: 'mult', label: 'Std-dev mult', default: 2, min: 1, max: 4 },
    ],
    run: (candles, p) => {
      const closes = candles.map((c) => c.c);
      const { upper, mid, lower } = bollinger(closes, p.period, p.mult);
      const out: Signal[] = [];
      let pos: Signal = 'flat';
      for (let i = 0; i < closes.length; i++) {
        if (!Number.isNaN(lower[i])) {
          if (pos === 'flat' && closes[i] < lower[i]) pos = 'long';
          else if (pos === 'long' && (closes[i] > mid[i] || closes[i] > upper[i])) pos = 'flat';
        }
        out.push(pos);
      }
      return out;
    },
  },
];

export function getStrategy(key: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.key === key);
}

export function defaultParams(def: StrategyDef): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

export function runStrategy(
  key: string,
  candles: Candle[],
  params: Record<string, number>
): Signal[] {
  const def = getStrategy(key);
  if (!def) throw new Error(`Unknown strategy: ${key}`);
  return def.run(candles, { ...defaultParams(def), ...params });
}
