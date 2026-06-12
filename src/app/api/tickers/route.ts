import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('tickers')
    .select('*')
    .order('symbol');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  const row = {
    symbol,
    name: String(body.name ?? ''),
    exchange: String(body.exchange ?? 'NYSEARCA'),
    timezone: String(body.timezone ?? 'America/New_York'),
    market_open: String(body.market_open ?? '09:30'),
    market_close: String(body.market_close ?? '16:00'),
  };
  const { data, error } = await supabaseAdmin().from('tickers').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabaseAdmin().from('tickers').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
