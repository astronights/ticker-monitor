import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Register this browser/device for push notifications. */
export async function POST(req: NextRequest) {
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, subscription: sub }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
