import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('alerts')
    .select('*, tickers(symbol)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const row = {
    ticker_id: Number(body.ticker_id),
    strategy: String(body.strategy ?? ''),
    params: body.params ?? {},
    signal_interval: body.signal_interval === '15m' ? '15m' : '1h',
  };
  if (!row.ticker_id || !row.strategy) {
    return NextResponse.json({ error: 'ticker_id and strategy required' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().from('alerts').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabaseAdmin().from('alerts').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
