'use client';

import { useEffect, useMemo, useState } from 'react';
import Chart from '@/components/Chart';
import { backtest } from '@/lib/backtest';
import { STRATEGIES, defaultParams, paramGrid } from '@/lib/strategies';
import type { BacktestResult, BacktestStats, Candle, Ticker } from '@/lib/types';

const COLORS = ['#2f81f7', '#d2a8ff', '#ffa657', '#39c5cf', '#ff7b72', '#7ee787', '#f778ba', '#a5d6ff'];
const BH_COLOR = '#8b949e';

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 91 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
];

// Grid search sweeps every interval over every window its data can support
// (intraday history is capped at ~60 days by Yahoo).
const GRID_PLAN: { interval: string; fetchDays: number; windows: { label: string; days: number }[] }[] = [
  { interval: '15m', fetchDays: 60, windows: [{ label: '1M', days: 30 }, { label: '2M', days: 60 }] },
  { interval: '1h', fetchDays: 60, windows: [{ label: '1M', days: 30 }, { label: '2M', days: 60 }] },
  {
    interval: '1d',
    fetchDays: 730,
    windows: [
      { label: '3M', days: 91 },
      { label: '6M', days: 182 },
      { label: '1Y', days: 365 },
      { label: '2Y', days: 730 },
    ],
  },
];

interface GridRow {
  id: string;
  strategy: string;
  label: string;
  params: Record<string, number>;
  paramsStr: string;
  interval: string;
  window: string;
  windowDays: number;
  stats: BacktestStats;
}

type SortKey = 'return' | 'dd' | 'trades' | 'sharpe';
const SORT_FNS: Record<SortKey, (r: GridRow) => number> = {
  return: (r) => -r.stats.totalReturnPct,
  dd: (r) => r.stats.maxDrawdownPct,
  trades: (r) => -r.stats.trades,
  sharpe: (r) => -r.stats.sharpe,
};

export default function BacktestPage() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerId, setTickerId] = useState<number | null>(null);
  const [interval, setInterval_] = useState('15m');
  const [rangeDays, setRangeDays] = useState(30);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(['sma_cross', 'rsi_reversion']));
  const [params, setParams] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(STRATEGIES.map((s) => [s.key, defaultParams(s)]))
  );
  const [results, setResults] = useState<BacktestResult[] | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gridRows, setGridRows] = useState<GridRow[] | null>(null);
  const [gridProgress, setGridProgress] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('return');

  useEffect(() => {
    fetch('/api/tickers')
      .then((r) => r.json())
      .then((data: Ticker[]) => {
        setTickers(data);
        setTickerId((cur) => cur ?? data[0]?.id ?? null);
      });
  }, []);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  async function run() {
    if (!tickerId) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const qs = new URLSearchParams({
        ticker_id: String(tickerId),
        interval,
        from: new Date(Date.now() - rangeDays * 86400_000).toISOString(),
      });
      const res = await fetch(`/api/candles?${qs}`);
      const data: Candle[] = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error);
      if (data.length < 50) {
        throw new Error(
          `Only ${data.length} bars available in this window. Intraday history is limited to ` +
            `~60 days of backfill plus whatever the collector has gathered — try the Daily interval ` +
            `or a shorter range.`
        );
      }
      setCandles(data);
      const out = [...selected].map((key) => backtest(key, data, params[key], interval));
      setResults(out);
      setFocus(out[0]?.strategy ?? null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

  async function gridSearch() {
    if (!tickerId) return;
    setBusy(true);
    setError('');
    setGridRows(null);
    try {
      const rows: GridRow[] = [];
      // Build the full task list first so progress is meaningful.
      const tasks: { interval: string; window: { label: string; days: number }; candles: Candle[] }[] = [];
      for (const plan of GRID_PLAN) {
        const qs = new URLSearchParams({
          ticker_id: String(tickerId),
          interval: plan.interval,
          from: new Date(Date.now() - plan.fetchDays * 86400_000).toISOString(),
        });
        const res = await fetch(`/api/candles?${qs}`);
        if (!res.ok) continue;
        const all: Candle[] = await res.json();
        for (const window of plan.windows) {
          const cutoff = Date.now() / 1000 - window.days * 86400;
          const slice = all.filter((c) => c.ts >= cutoff);
          if (slice.length >= 60) tasks.push({ interval: plan.interval, window, candles: slice });
        }
      }
      const combos = STRATEGIES.flatMap((def) =>
        paramGrid(def).map((p) => ({ def, p }))
      );
      const total = tasks.length * combos.length;
      let done = 0;
      for (const task of tasks) {
        for (const { def, p } of combos) {
          const result = backtest(def.key, task.candles, p, task.interval);
          rows.push({
            id: `${def.key}-${task.interval}-${task.window.label}-${JSON.stringify(p)}`,
            strategy: def.key,
            label: def.label,
            params: p,
            paramsStr: def.params.map((pd) => `${pd.label.toLowerCase()} ${p[pd.key]}`).join(' · '),
            interval: task.interval,
            window: task.window.label,
            windowDays: task.window.days,
            stats: result.stats,
          });
          done++;
          if (done % 50 === 0) {
            setGridProgress(`Testing combination ${done} of ${total}…`);
            await new Promise((r) => setTimeout(r, 0)); // let the UI breathe
          }
        }
      }
      if (!rows.length) throw new Error('Not enough data for any interval/window — backfill first.');
      setGridRows(rows);
      setGridProgress('');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setGridProgress('');
    }
    setBusy(false);
  }

  function applyCombo(row: GridRow) {
    setSelected(new Set([row.strategy]));
    setParams((cur) => ({ ...cur, [row.strategy]: { ...cur[row.strategy], ...row.params } }));
    setInterval_(row.interval);
    setRangeDays(row.windowDays);
    setResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const sortedGrid = useMemo(() => {
    if (!gridRows) return null;
    return [...gridRows].sort((a, b) => SORT_FNS[sortKey](a) - SORT_FNS[sortKey](b));
  }, [gridRows, sortKey]);

  const equityLines = useMemo(() => {
    if (!results || !candles.length) return [];
    const first = candles[0].c;
    return [
      {
        label: 'Buy & Hold',
        color: BH_COLOR,
        points: candles.map((c) => ({ ts: c.ts, value: c.c / first })),
      },
      ...results.map((r, i) => ({
        label: r.label,
        color: COLORS[i % COLORS.length],
        points: r.equity,
      })),
    ];
  }, [results, candles]);

  const bestReturn = results?.length
    ? Math.max(...results.map((r) => r.stats.totalReturnPct))
    : 0;

  return (
    <div>
      <h1>Backtest Lab</h1>

      <div className="panel">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <label>Ticker</label>
            <select value={tickerId ?? ''} onChange={(e) => setTickerId(Number(e.target.value))}>
              {tickers.map((t) => (
                <option key={t.id} value={t.id}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Bars</label>
            <select value={interval} onChange={(e) => setInterval_(e.target.value)}>
              <option value="15m">15 min</option>
              <option value="1h">1 hour</option>
              <option value="1d">Daily</option>
            </select>
          </div>
          <div>
            <label>Window</label>
            <div className="preset-group">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={rangeDays === r.days ? 'active' : ''}
                  onClick={() => setRangeDays(r.days)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={run}
          disabled={busy || !selected.size}
          style={{ width: '100%', marginTop: 14 }}
        >
          {busy ? 'Running…' : `Run ${selected.size} ${selected.size === 1 ? 'strategy' : 'strategies'}`}
        </button>
        <button
          className="secondary"
          onClick={gridSearch}
          disabled={busy}
          style={{ width: '100%', marginTop: 8 }}
        >
          {gridProgress || '🔍 Grid search — every strategy, parameter set, interval & window'}
        </button>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Strategies</h2>
        <div className="strat-grid">
          {STRATEGIES.map((s) => {
            const on = selected.has(s.key);
            return (
              <div
                key={s.key}
                className={`strat-card ${on ? 'selected' : ''}`}
                onClick={() => toggle(s.key)}
              >
                <div className="strat-head">
                  <input type="checkbox" checked={on} readOnly />
                  {s.label}
                </div>
                {on && (
                  <div className="strat-params" onClick={(e) => e.stopPropagation()}>
                    {s.params.map((p) => (
                      <span key={p.key}>
                        <span className="pname">{p.label}</span>
                        <input
                          type="number"
                          min={p.min}
                          max={p.max}
                          value={params[s.key][p.key]}
                          onChange={(e) =>
                            setParams({
                              ...params,
                              [s.key]: { ...params[s.key], [p.key]: Number(e.target.value) },
                            })
                          }
                        />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="panel"><p className="error" style={{ margin: 0 }}>{error}</p></div>}

      {results && (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>
              Price & trades
              {focus && (
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}— {results.find((r) => r.strategy === focus)?.label}
                </span>
              )}
            </h2>
            <Chart
              candles={candles}
              markers={results.find((r) => r.strategy === focus)?.markers}
              height={330}
            />
            <p className="muted" style={{ marginBottom: 0 }}>
              ▲▼ show where the highlighted strategy bought and sold. Tap a row in the results
              table to switch strategy.
            </p>
          </div>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Equity curves (normalized)</h2>
            <Chart lines={equityLines} height={300} />
            <div className="row" style={{ marginTop: 8 }}>
              {equityLines.map((l) => (
                <span key={l.label} style={{ fontSize: 13 }}>
                  <span style={{ color: l.color }}>●</span> {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th className="num">Return</th>
                  <th className="num">Max DD</th>
                  <th className="num">Trades</th>
                  <th className="num">Win rate</th>
                  <th className="num">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="muted">Buy & Hold</td>
                  <td className={`num ${(results[0]?.stats.buyHoldReturnPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                    {results[0]?.stats.buyHoldReturnPct.toFixed(1)}%
                  </td>
                  <td className="num muted">—</td>
                  <td className="num muted">—</td>
                  <td className="num muted">—</td>
                  <td className="num muted">—</td>
                </tr>
                {results.map((r) => (
                  <tr
                    key={r.strategy}
                    className={`clickable ${focus === r.strategy ? 'focused' : ''}`}
                    onClick={() => setFocus(r.strategy)}
                  >
                    <td>
                      {r.label}
                      {r.stats.totalReturnPct === bestReturn && results.length > 1 && ' 🏆'}
                    </td>
                    <td className={`num ${r.stats.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>
                      {r.stats.totalReturnPct.toFixed(1)}%
                    </td>
                    <td className="num">{r.stats.maxDrawdownPct.toFixed(1)}%</td>
                    <td className="num">{r.stats.trades}</td>
                    <td className="num">{r.stats.trades ? `${r.stats.winRatePct.toFixed(0)}%` : '—'}</td>
                    <td className="num">{r.stats.sharpe.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {results.some((r) => r.stats.trades === 0) && (
              <p className="muted">
                ⚠️ Strategies with 0 trades never hit their entry condition in this window (e.g.
                RSI never dropped below the buy threshold) — they sat in cash the whole time. Try a
                longer window, looser thresholds, or intraday bars.
              </p>
            )}
            <p className="muted">
              Long-only, all-in/all-out at bar close, 5 bps fee per side. Past performance ≠ future results.
            </p>
          </div>
        </>
      )}

      {sortedGrid && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            Grid search — {tickers.find((t) => t.id === tickerId)?.symbol}{' '}
            <span className="muted" style={{ fontWeight: 400 }}>
              top 40 of {sortedGrid.length} combinations
            </span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Bars</th>
                  <th>Window</th>
                  <th className={`num sortable ${sortKey === 'return' ? 'sorted' : ''}`} onClick={() => setSortKey('return')}>
                    Return ↓
                  </th>
                  <th className={`num sortable ${sortKey === 'dd' ? 'sorted' : ''}`} onClick={() => setSortKey('dd')}>
                    Max DD ↓
                  </th>
                  <th className={`num sortable ${sortKey === 'trades' ? 'sorted' : ''}`} onClick={() => setSortKey('trades')}>
                    Trades ↓
                  </th>
                  <th className="num">Win</th>
                  <th className={`num sortable ${sortKey === 'sharpe' ? 'sorted' : ''}`} onClick={() => setSortKey('sharpe')}>
                    Sharpe ↓
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedGrid.slice(0, 40).map((r, i) => (
                  <tr key={r.id} className="clickable" onClick={() => applyCombo(r)}>
                    <td>
                      {i === 0 && '🏆 '}
                      <strong>{r.label}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{r.paramsStr}</div>
                    </td>
                    <td>{r.interval}</td>
                    <td>{r.window}</td>
                    <td className={`num ${r.stats.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>
                      {r.stats.totalReturnPct.toFixed(1)}%
                    </td>
                    <td className="num">{r.stats.maxDrawdownPct.toFixed(1)}%</td>
                    <td className="num">{r.stats.trades}</td>
                    <td className="num">{r.stats.trades ? `${r.stats.winRatePct.toFixed(0)}%` : '—'}</td>
                    <td className="num">{r.stats.sharpe.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Tap a column header to re-rank, tap a row to load that combination into the controls
            above. Beware overfitting: the top result is the best <em>past</em> fit, not a
            guarantee — prefer combos that also score well on Sharpe and have a sane trade count.
            Returns across different windows aren&apos;t directly comparable.
          </p>
        </div>
      )}
    </div>
  );
}
