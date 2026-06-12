'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '@/lib/types';

interface Line {
  label: string;
  color: string;
  points: { ts: number; value: number }[];
}

interface Props {
  candles?: Candle[];
  lines?: Line[];
  markers?: { ts: number; side: 'buy' | 'sell'; price: number }[];
  height?: number;
}

export default function Chart({ candles, lines, markers, height = 420 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#161b22' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      timeScale: { timeVisible: true, borderColor: '#30363d' },
      rightPriceScale: { borderColor: '#30363d' },
    });
    chartRef.current = chart;

    if (candles?.length) {
      const series = chart.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderVisible: false,
        wickUpColor: '#3fb950',
        wickDownColor: '#f85149',
      });
      series.setData(
        candles.map((c) => ({
          time: c.ts as UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }))
      );
      if (markers?.length) {
        const ms: SeriesMarker<Time>[] = markers.map((m) => ({
          time: m.ts as UTCTimestamp,
          position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
          color: m.side === 'buy' ? '#3fb950' : '#f85149',
          shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: m.side.toUpperCase(),
        }));
        series.setMarkers(ms);
      }
    }

    for (const line of lines ?? []) {
      const s = chart.addLineSeries({ color: line.color, lineWidth: 2, title: line.label });
      s.setData(line.points.map((p) => ({ time: p.ts as UTCTimestamp, value: p.value })));
    }

    chart.timeScale().fitContent();
    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 600 });
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, lines, markers, height]);

  return <div ref={ref} style={{ width: '100%' }} />;
}
