import webpush from 'web-push';
import { supabaseAdmin } from './supabaseAdmin';

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv);
    configured = true;
  }
  return true;
}

/** Send a notification to every registered device; prune dead subscriptions. */
export async function sendPushToAll(title: string, body: string, url = '/live'): Promise<void> {
  if (!ensureConfigured()) return;
  const sb = supabaseAdmin();
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, subscription');
  if (!subs?.length) return;
  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
        }
      }
    })
  );
}
