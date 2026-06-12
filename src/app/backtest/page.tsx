'use client';

import { useEffect, useMemo, useState } from 'react';
import Chart from '@/components/Chart';
import { backtest } from '@/lib/backtest';
import { STRATEGIES, defaultParams } from '@/lib/strategies';
import type { BacktestResult, Candle, Ticker } from '@/lib/types';

const COLORS = ['#2f81f7', '#d2a8ff', '#ffa657', '#39c5cf', '#ff7b72', '#7ee787', '#f778ba', '#a5d6ff'];
const BH_COLOR = '#8b949e';

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 91 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
];

export default function BacktestPage() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerId, setTickerId] = useState<number | null>(null);
  const [interval, setInterval_] = useState('1d');
  const [rangeDays, setRangeDays] = useState(365);
  const [selected, setSelected] = useState<Set<string>>(new Set(['sma_cross', 'rsi_reversion']));
  const [params, setParams] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(STRATEGIES.map((s) => [s.key, defaultParams(s)]))
  );
  const [results, setResults] = useState<BacktestResult[] | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      setResults([...selected].map((key) => backtest(key, data, params[key], interval)));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

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
              <option value="1d">Daily</option>
              <option value="1h">1 hour</option>
              <option value="15m">15 min</option>
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
          <button onClick={run} disabled={busy || !selected.size} style={{ marginLeft: 'auto' }}>
            {busy ? 'Running…' : `Run ${selected.size} ${selected.size === 1 ? 'strategy' : 'strategies'}`}
          </button>
        </div>
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
            <h2 style={{ marginTop: 0 }}>Equity curves (normalized)</h2>
            <Chart lines={equityLines} height={360} />
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
                  <tr key={r.strategy}>
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
    </div>
  );
}
