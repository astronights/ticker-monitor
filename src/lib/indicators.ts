/** All indicators return arrays aligned with input; leading values are NaN until warm. */

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's RSI */
export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function macd(
  values: number[],
  fast: number,
  slow: number,
  signalPeriod: number
): { macd: number[]; signal: number[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  // Signal line: EMA over the macd line once it is defined.
  const start = macdLine.findIndex((v) => !Number.isNaN(v));
  const defined = start >= 0 ? macdLine.slice(start) : [];
  const sig = ema(defined, signalPeriod);
  const signalLine = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < sig.length; i++) signalLine[start + i] = sig[i];
  return { macd: macdLine, signal: signalLine };
}

export function bollinger(
  values: number[],
  period: number,
  mult: number
): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, mid, lower };
}

/** Stochastic %K (raw), smoothed with a 3-period SMA into %D. */
export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
): { k: number[]; d: number[] } {
  const k = new Array<number>(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, highs[j]);
      lo = Math.min(lo, lows[j]);
    }
    k[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
  }
  const start = k.findIndex((v) => !Number.isNaN(v));
  const d = new Array<number>(closes.length).fill(NaN);
  if (start >= 0) {
    const smoothed = sma(k.slice(start), 3);
    for (let i = 0; i < smoothed.length; i++) d[start + i] = smoothed[i];
  }
  return { k, d };
}

/** Rate of change over `period` bars, in percent. */
export function roc(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    out[i] = (values[i] / values[i - period] - 1) * 100;
  }
  return out;
}

/** Average True Range over `period` bars (Wilder's smoothing). */
export function atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  let smoothed = NaN;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    if (i < period) {
      if (Number.isNaN(smoothed)) smoothed = 0;
      smoothed += tr / period;
    } else if (i === period) {
      smoothed = smoothed! + tr / period;
      out[i] = smoothed;
    } else {
      smoothed = (smoothed * (period - 1) + tr) / period;
      out[i] = smoothed;
    }
  }
  return out;
}

/** Rolling highest-high / lowest-low over the previous `period` bars (excluding current). */
export function donchian(
  highs: number[],
  lows: number[],
  period: number
): { upper: number[]; lower: number[] } {
  const upper = new Array<number>(highs.length).fill(NaN);
  const lower = new Array<number>(lows.length).fill(NaN);
  for (let i = period; i < highs.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period; j < i; j++) {
      hi = Math.max(hi, highs[j]);
      lo = Math.min(lo, lows[j]);
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}
