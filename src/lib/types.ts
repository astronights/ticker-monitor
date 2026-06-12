export interface Candle {
  ts: number; // unix seconds, bar open (UTC)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Ticker {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  timezone: string;
  market_open: string;
  market_close: string;
  active: boolean;
}

export type Signal = 'long' | 'flat';

export interface StrategyDef {
  key: string;
  label: string;
  params: {
    key: string;
    label: string;
    default: number;
    min: number;
    max: number;
    /** Values to try in grid search (defaults to just the default value). */
    grid?: number[];
  }[];
  /** Returns desired position for every bar (same length as candles). */
  run: (candles: Candle[], params: Record<string, number>) => Signal[];
}

export interface BacktestStats {
  totalReturnPct: number;
  buyHoldReturnPct: number;
  maxDrawdownPct: number;
  trades: number;
  winRatePct: number;
  sharpe: number;
}

export interface BacktestResult {
  strategy: string;
  label: string;
  equity: { ts: number; value: number }[]; // normalized, starts at 1
  stats: BacktestStats;
  markers: { ts: number; side: 'buy' | 'sell'; price: number }[];
}
