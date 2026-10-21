import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:support@cssestimation.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getPakistanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function runDailyReminders() {
  console.log('--- Starting Daily Due Bill Check ---');

  const pktDate = getPakistanDateKey();
  console.log(`Checking unpaid transactions due on: ${pktDate}`);

  // Fetch unpaid transactions due today
  const { data: dueItems, error: txError } = await supabase
    .from('transactions')
    .select('id, title, amount, due_date, user_id, is_paid')
    .eq('due_date', pktDate)
    .neq('is_paid', true);

  if (txError) {
    console.error('Database query error:', txError.message);
    process.exit(1);
  }

  if (!dueItems || dueItems.length === 0) {
    console.log('No unpaid transactions due today. Exiting.');
    return;
  }

  console.log(`Found ${dueItems.length} due transaction(s). Dispatching alerts...`);

  let sentCount = 0;

  for (const item of dueItems) {
    const { data: subs, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', item.user_id);

    if (subError || !subs || subs.length === 0) {
      console.log(`No active push subscription registered for user ${item.user_id}`);
      continue;
    }

    const payload = JSON.stringify({
      title: 'Due Today: Rozana Hisaab 🔔',
      body: `${item.title} of PKR ${Number(item.amount).toLocaleString()} is due today!`,
      url: '/',
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { auth: sub.auth, p256dh: sub.p256dh },
          },
          payload
        );
        sentCount++;
        console.log(`Dispatched reminder for "${item.title}"`);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription expired (status ${err.statusCode}). Removing from database...`);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error(`Failed to send to endpoint: ${err.message}`);
        }
      }
    }
  }

  console.log(`Completed. Dispatched ${sentCount} notification(s).`);
}

runDailyReminders();
