'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Chart from '@/components/Chart';
import { STRATEGIES, defaultParams, runStrategy } from '@/lib/strategies';
import type { Candle, Ticker } from '@/lib/types';

interface AlertRow {
  id: number;
  ticker_id: number;
  strategy: string;
  signal_interval: string;
  last_signal: string | null;
  tickers: { symbol: string };
}

function LiveInner() {
  const search = useSearchParams();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerId, setTickerId] = useState<number | null>(
    search.get('ticker') ? Number(search.get('ticker')) : null
  );
  const [strategyKey, setStrategyKey] = useState(search.get('strategy') ?? 'sma_cross');
  const [interval, setInterval_] = useState<'15m' | '1h'>('1h');
  const [params, setParams] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(STRATEGIES.map((s) => [s.key, defaultParams(s)]))
  );
  const [candles, setCandles] = useState<Candle[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [pushState, setPushState] = useState('');

  const strategy = STRATEGIES.find((s) => s.key === strategyKey)!;

  useEffect(() => {
    fetch('/api/tickers')
      .then((r) => r.json())
      .then((data: Ticker[]) => {
        setTickers(data);
        setTickerId((cur) => cur ?? data[0]?.id ?? null);
      });
    loadAlerts();
  }, []);

  const loadAlerts = () =>
    fetch('/api/alerts')
      .then((r) => r.json())
      .then(setAlerts);

  const loadCandles = useCallback(async () => {
    if (!tickerId) return;
    const from = new Date(Date.now() - 30 * 86400_000).toISOString();
    const res = await fetch(`/api/candles?ticker_id=${tickerId}&interval=${interval}&from=${from}`);
    if (res.ok) setCandles(await res.json());
  }, [tickerId, interval]);

  useEffect(() => {
    loadCandles();
    const t = window.setInterval(loadCandles, 60_000);
    return () => window.clearInterval(t);
  }, [loadCandles]);

  const { signal, markers } = useMemo(() => {
    if (candles.length < 30) return { signal: null, markers: [] };
    const signals = runStrategy(strategyKey, candles, params[strategyKey]);
    const markers: { ts: number; side: 'buy' | 'sell'; price: number }[] = [];
    for (let i = 1; i < signals.length; i++) {
      if (signals[i] !== signals[i - 1]) {
        markers.push({
          ts: candles[i].ts,
          side: signals[i] === 'long' ? 'buy' : 'sell',
          price: candles[i].c,
        });
      }
    }
    return { signal: signals[signals.length - 1], markers };
  }, [candles, strategyKey, params]);

  async function enablePushAndWatch() {
    if (!tickerId) return;
    setPushState('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push not supported in this browser. On iOS, add the app to your home screen first.');
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notification permission denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      const r1 = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r1.ok) throw new Error('Failed saving push subscription');
      const r2 = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker_id: tickerId,
          strategy: strategyKey,
          params: params[strategyKey],
          signal_interval: interval,
        }),
      });
      if (!r2.ok) throw new Error('Failed creating alert');
      setPushState('✅ Watching — you will get a push when the signal flips.');
      loadAlerts();
    } catch (e) {
      setPushState(`⚠️ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function removeAlert(id: number) {
    await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
    loadAlerts();
  }

  const symbol = tickers.find((t) => t.id === tickerId)?.symbol ?? '';

  return (
    <div>
      <h1>Live Signals</h1>

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
            <label>Strategy</label>
            <select value={strategyKey} onChange={(e) => setStrategyKey(e.target.value)}>
              {STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Signal bars</label>
            <select value={interval} onChange={(e) => setInterval_(e.target.value as '15m' | '1h')}>
              <option value="1h">1 hour</option>
              <option value="15m">15 min</option>
            </select>
          </div>
          {strategy.params.map((p) => (
            <div key={p.key}>
              <label>{p.label}</label>
              <input
                type="number"
                style={{ width: 80 }}
                value={params[strategyKey][p.key]}
                onChange={(e) =>
                  setParams({
                    ...params,
                    [strategyKey]: { ...params[strategyKey], [p.key]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      {signal && (
        <div className={`signal-banner ${signal}`}>
          {symbol} · {strategy.label} ({interval}):{' '}
          {signal === 'long' ? '🟢 IN POSITION / BUY zone' : '⚪ FLAT / stay out'}
          <span className="muted" style={{ fontWeight: 400, marginLeft: 10 }}>
            last price {candles[candles.length - 1]?.c.toFixed(2)}
          </span>
        </div>
      )}

      <div className="panel">
        <Chart candles={candles} markers={markers} />
        {candles.length < 30 && (
          <p className="muted">
            Not enough intraday data yet — backfill from the dashboard, or wait for collection.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Push alerts</h2>
          <button onClick={enablePushAndWatch} disabled={!tickerId}>
            🔔 Watch {symbol} · {strategy.label} ({interval})
          </button>
        </div>
        {pushState && <p>{pushState}</p>}
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Ticker</th><th>Strategy</th><th>Bars</th><th>State</th><th />
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.tickers?.symbol}</strong></td>
                <td>{STRATEGIES.find((s) => s.key === a.strategy)?.label ?? a.strategy}</td>
                <td>{a.signal_interval}</td>
                <td>
                  <span className={`badge ${a.last_signal ?? 'flat'}`}>
                    {a.last_signal ?? 'pending'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="danger" onClick={() => removeAlert(a.id)}>✕</button>
                </td>
              </tr>
            ))}
            {!alerts.length && <tr><td colSpan={5} className="muted">No alerts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense>
      <LiveInner />
    </Suspense>
  );
}
