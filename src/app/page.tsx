'use client';

import { useCallback, useEffect, useState } from 'react';

interface TickerStatus {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  timezone: string;
  active: boolean;
  latest_15m: string | null;
  latest_1d: string | null;
  bars: number;
}

const TZ_PRESETS = [
  { label: 'US (NYSE/NASDAQ)', timezone: 'America/New_York', open: '09:30', close: '16:00', exchange: 'NYSEARCA' },
  { label: 'India (BSE/NSE)', timezone: 'Asia/Kolkata', open: '09:15', close: '15:30', exchange: 'BSE' },
  { label: 'Singapore (SGX)', timezone: 'Asia/Singapore', open: '09:00', close: '17:00', exchange: 'SGX' },
];

function ago(ts: string | null): string {
  if (!ts) return '—';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function Dashboard() {
  const [tickers, setTickers] = useState<TickerStatus[]>([]);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/status');
    if (res.ok) setTickers(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTicker(e: React.FormEvent) {
    e.preventDefault();
    const p = TZ_PRESETS[preset];
    setBusy('add');
    const res = await fetch('/api/tickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        name,
        exchange: p.exchange,
        timezone: p.timezone,
        market_open: p.open,
        market_close: p.close,
      }),
    });
    setBusy('');
    if (res.ok) {
      setSymbol('');
      setName('');
      load();
    } else {
      setMsg((await res.json()).error ?? 'failed');
    }
  }

  async function removeTicker(id: number, sym: string) {
    if (!confirm(`Remove ${sym} and all its data?`)) return;
    await fetch(`/api/tickers?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function backfill(id: number, sym: string) {
    setBusy(`bf-${id}`);
    setMsg(`Backfilling ${sym}…`);
    const res = await fetch(`/api/backfill?ticker_id=${id}`, { method: 'POST' });
    const json = await res.json();
    setMsg(
      res.ok
        ? `${sym}: loaded ${json.daily} daily + ${json.intraday} intraday bars`
        : `${sym}: ${json.error}`
    );
    setBusy('');
    load();
  }

  async function backfillAll() {
    for (const t of tickers) {
      await backfill(t.id, t.symbol);
    }
    setMsg('Backfill complete for all tickers');
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Tracked tickers</h2>
          <button className="secondary" onClick={backfillAll} disabled={!!busy}>
            Backfill history (all)
          </button>
        </div>
        <div className="table-wrap">
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="hide-sm">Name</th>
              <th className="hide-sm">Exchange</th>
              <th className="num">Bars</th>
              <th>Last 15m</th>
              <th className="hide-sm">Last daily</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickers.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.symbol}</strong></td>
                <td className="muted hide-sm">{t.name}</td>
                <td className="muted hide-sm">{t.exchange}</td>
                <td className="num">{t.bars.toLocaleString()}</td>
                <td>{ago(t.latest_15m)}</td>
                <td className="hide-sm">{ago(t.latest_1d)}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => backfill(t.id, t.symbol)}
                    >
                      {busy === `bf-${t.id}` ? '…' : 'Backfill'}
                    </button>
                    <button className="danger" onClick={() => removeTicker(t.id, t.symbol)}>
                      ✕
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {!tickers.length && (
              <tr><td colSpan={7} className="muted">No tickers yet — apply the Supabase migrations first.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Add ticker</h2>
        <form onSubmit={addTicker} className="row">
          <div>
            <label>Yahoo symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. DBC or RELIANCE.BO"
              required
            />
          </div>
          <div>
            <label>Name (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>Market</label>
            <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
              {TZ_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button disabled={busy === 'add'}>Add</button>
          </div>
        </form>
        <p className="muted">
          BSE symbols end in .BO, NSE in .NS, SGX in .SI (Yahoo Finance conventions). After adding,
          hit Backfill to load history.
        </p>
      </div>
    </div>
  );
}
