-- Default new alerts to 15-minute signal bars, and switch existing alerts over.
alter table alerts alter column signal_interval set default '15m';

update alerts
set signal_interval = '15m',
    last_signal = null   -- re-baseline so the first 15m evaluation doesn't fire a stale flip
where signal_interval <> '15m';
