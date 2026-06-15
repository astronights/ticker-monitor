'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Chart from '@/components/Chart';
import { STRATEGIES, defaultParams, runStrategy } from '@/lib/strategies';
import { atr } from '@/lib/indicators';
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
  const [interval, setInterval_] = useState<'15m' | '1h'>('15m');
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

  const ATR_PERIOD = 14;
  const ATR_MULT = 1.0; // zone = flip price ± 1 ATR

  const { signal, markers, entryZone } = useMemo(() => {
    if (candles.length < 30) return { signal: null, markers: [], entryZone: null };
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

    // Compute entry zone based on ATR at the time of the last signal flip
    let entryZone: { low: number; high: number; atrVal: number } | null = null;
    if (markers.length > 0) {
      const flip = markers[markers.length - 1];
      const flipIdx = candles.findIndex((c) => c.ts === flip.ts);
      const slice = flipIdx >= ATR_PERIOD ? candles.slice(0, flipIdx + 1) : candles.slice(0, ATR_PERIOD + 1);
      const atrArr = atr(
        slice.map((c) => c.h),
        slice.map((c) => c.l),
        slice.map((c) => c.c),
        ATR_PERIOD
      );
      const atrVal = atrArr.findLast((v) => !Number.isNaN(v)) ?? 0;
      entryZone = {
        low: flip.price - ATR_MULT * atrVal,
        high: flip.price + ATR_MULT * atrVal,
        atrVal,
      };
    }

    return { signal: signals[signals.length - 1], markers, entryZone };
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
              <option value="15m">15 min</option>
              <option value="1h">1 hour</option>
            </select>
          </div>
        </div>
        {strategy.params.length > 0 && (
          <div className="strat-params" style={{ marginTop: 12 }}>
            {strategy.params.map((p) => (
              <span key={p.key}>
                <span className="pname">{p.label}</span>
                <input
                  type="number"
                  value={params[strategyKey][p.key]}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      [strategyKey]: { ...params[strategyKey], [p.key]: Number(e.target.value) },
                    })
                  }
                />
              </span>
            ))}
          </div>
        )}
      </div>

      {signal && (
        <div className={`signal-banner ${signal}`}>
          <div>
            {symbol} · {strategy.label} ({interval}):{' '}
            {signal === 'long' ? '🟢 BUY / stay invested' : '⚪ SELL / stay in cash'}
            <span className="muted" style={{ fontWeight: 400, marginLeft: 10 }}>
              last price {candles[candles.length - 1]?.c.toFixed(2)}
            </span>
          </div>
          {markers.length > 0 && (() => {
            const flip = markers[markers.length - 1];
            const last = candles[candles.length - 1];
            const driftPct = (last.c / flip.price - 1) * 100;
            const staleMin = Math.round(Date.now() / 60000 - last.ts / 60);
            const inZone = entryZone ? last.c >= entryZone.low && last.c <= entryZone.high : true;
            return (
              <>
                <div className="muted" style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>
                  Signal: {flip.side.toUpperCase()} @ {flip.price.toFixed(2)} ·{' '}
                  {new Date(flip.ts * 1000).toLocaleString([], {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}{' '}
                  — price since then{' '}
                  <span className={driftPct >= 0 ? 'pos' : 'neg'}>
                    {driftPct >= 0 ? '+' : ''}{driftPct.toFixed(2)}%
                  </span>{' '}
                  · data as of {staleMin <= 1 ? 'now' : `${staleMin}m ago`}
                </div>
                {entryZone && (
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>
                    Entry zone: {entryZone.low.toFixed(2)} – {entryZone.high.toFixed(2)}{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      (±1 ATR of {entryZone.atrVal.toFixed(2)})
                    </span>{' '}
                    · current {last.c.toFixed(2)}{' '}
                    {inZone
                      ? <span className="pos">✓ within range</span>
                      : <span className="neg">⚠ price moved too far — consider waiting</span>
                    }
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div className="panel">
        <Chart candles={candles} markers={markers} />
        {candles.length < 30 ? (
          <p className="muted">
            Not enough intraday data yet — backfill from the dashboard, or wait for collection.
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            ▲▼ mark every point where this strategy flipped in the past 30 days. The banner above
            is its <em>current</em> stance; it re-evaluates as each new {interval} bar completes
            (prices refresh every 15 min during market hours). A push alert fires only when the
            stance flips — if you&apos;re watching this combo.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Push alerts</h2>
          <button className="watch-btn" onClick={enablePushAndWatch} disabled={!tickerId}>
            🔔 Watch {symbol} · {strategy.label} ({interval})
          </button>
        </div>
        {pushState && <p>{pushState}</p>}
        <div className="table-wrap">
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
