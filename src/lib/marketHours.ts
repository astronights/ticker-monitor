import type { Ticker } from './types';

/** Minutes since local midnight + weekday in the given IANA timezone, right now. */
function localNow(timezone: string): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    minutes: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Is the ticker's home market open right now? A small grace period after the
 * close lets the final bar of the day get collected.
 */
export function isMarketOpen(ticker: Ticker, graceMinutes = 20): boolean {
  const { minutes, weekday } = localNow(ticker.timezone);
  if (weekday === 0 || weekday === 6) return false;
  const open = hhmmToMinutes(ticker.market_open);
  const close = hhmmToMinutes(ticker.market_close) + graceMinutes;
  return minutes >= open && minutes <= close;
}
