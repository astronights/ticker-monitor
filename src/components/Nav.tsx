'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/backtest', label: 'Backtest' },
  { href: '/live', label: 'Live' },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <nav>
      <span className="brand">📈 Ticker Monitor</span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
