'use client';

import { useEffect, useMemo, useState } from 'react';
import Chart from '@/components/Chart';
import { backtest } from '@/lib/backtest';
import { STRATEGIES, defaultParams } from '@/lib/strategies';
import type { BacktestResult, Candle, Ticker } from '@/lib/types';

const COLORS = ['#2f81f7', '#d2a8ff', '#ffa657', '#39c5cf', '#ff7b72'];
const BH_COLOR = '#8b949e';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export default function BacktestPage() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerId, setTickerId] = useState<number | null>(null);
  const [interval, setInterval_] = useState('1d');
  const [from, setFrom] = useState(isoDaysAgo(365));
  const [to, setTo] = useState(isoDaysAgo(0));
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
        if (data.length && tickerId === null) setTickerId(data[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!tickerId) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const qs = new URLSearchParams({
        ticker_id: String(tickerId),
        interval,
        from: new Date(from).toISOString(),
        to: new Date(`${to}T23:59:59Z`).toISOString(),
      });
      const res = await fetch(`/api/candles?${qs}`);
      const data: Candle[] = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error);
      if (data.length < 50) {
        throw new Error(
          `Only ${data.length} bars in this window — backfill more history or widen the range.`
        );
      }
      setCandles(data);
      setResults(
        [...selected].map((key) => backtest(key, data, params[key], interval))
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

  const equityLines = useMemo(() => {
    if (!results || !candles.length) return [];
    const first = candles[0].c;
    const bh = {
      label: 'Buy & Hold',
      color: BH_COLOR,
      points: candles.map((c) => ({ ts: c.ts, value: c.c / first })),
    };
    return [
      bh,
      ...results.map((r, i) => ({
        label: r.label,
        color: COLORS[i % COLORS.length],
        points: r.equity,
      })),
    ];
  }, [results, candles]);

  return (
    <div>
      <h1>Backtest Lab</h1>

      <div className="panel">
        <div className="row">
          <div>
            <label>Ticker</label>
            <select value={tickerId ?? ''} onChange={(e) => setTickerId(Number(e.target.value))}>
              {tickers.map((t) => (
                <option key={t.id} value={t.id}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Bar interval</label>
            <select value={interval} onChange={(e) => setInterval_(e.target.value)}>
              <option value="1d">Daily</option>
              <option value="1h">1 hour</option>
              <option value="15m">15 min</option>
            </select>
          </div>
          <div>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button onClick={run} disabled={busy || !selected.size}>
              {busy ? 'Running…' : 'Run backtest'}
            </button>
          </div>
        </div>
        {interval !== '1d' && (
          <p className="muted">Intraday history starts when collection went live (plus ~60 days of backfill).</p>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Strategies</h2>
        {STRATEGIES.map((s) => (
          <div key={s.key} className="row" style={{ marginBottom: 10 }}>
            <label style={{ width: 180, margin: 0, color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={selected.has(s.key)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(s.key);
                  else next.delete(s.key);
                  setSelected(next);
                }}
              />{' '}
              {s.label}
            </label>
            {s.params.map((p) => (
              <span key={p.key} className="row" style={{ gap: 4 }}>
                <span className="muted" style={{ fontSize: 13 }}>{p.label}</span>
                <input
                  type="number"
                  style={{ width: 70 }}
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
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {results && (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Equity curves (normalized)</h2>
            <Chart lines={equityLines} height={360} />
          </div>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th className="num">Return</th>
                  <th className="num">Buy&Hold</th>
                  <th className="num">Max DD</th>
                  <th className="num">Trades</th>
                  <th className="num">Win rate</th>
                  <th className="num">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.strategy}>
                    <td>{r.label}</td>
                    <td className={`num ${r.stats.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>
                      {r.stats.totalReturnPct.toFixed(1)}%
                    </td>
                    <td className="num muted">{r.stats.buyHoldReturnPct.toFixed(1)}%</td>
                    <td className="num">{r.stats.maxDrawdownPct.toFixed(1)}%</td>
                    <td className="num">{r.stats.trades}</td>
                    <td className="num">{r.stats.winRatePct.toFixed(0)}%</td>
                    <td className="num">{r.stats.sharpe.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Long-only, all-in/all-out, 5 bps per side. Past performance ≠ future results.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
