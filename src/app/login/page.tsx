'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (res.ok) router.push('/');
    else setError('Wrong passcode');
  }

  return (
    <div className="login-wrap">
      <form onSubmit={submit} className="panel" style={{ width: 320 }}>
        <h1>📈 Ticker Monitor</h1>
        <label>Passcode</label>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        <button disabled={busy} style={{ width: '100%' }}>
          {busy ? '…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
