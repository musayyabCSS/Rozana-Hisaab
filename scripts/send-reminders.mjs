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

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Same rule as getNextExpectedIssueDate in src/lib/billConnections.ts: the
// billing interval after the last issue date, clamped to the end of shorter months.
function getNextExpectedIssueDate(lastIssueDate, intervalMonths) {
  const [year, month, day] = lastIssueDate.split('-').map(Number);
  const interval = Number.isInteger(intervalMonths) && intervalMonths >= 1 && intervalMonths <= 12 ? intervalMonths : 1;
  const monthIndex = month - 1 + interval;
  const nextYear = year + Math.floor(monthIndex / 12);
  const nextMonth = monthIndex % 12;
  const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day, daysInNextMonth);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

let sentCount = 0;

async function sendToUser(userId, payload, label) {
  const { data: subs, error: subError } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (subError || !subs || subs.length === 0) {
    console.log(`No active push subscription registered for user ${userId}`);
    return;
  }

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { auth: sub.auth, p256dh: sub.p256dh },
        },
        JSON.stringify(payload)
      );
      sentCount++;
      console.log(`Dispatched reminder for "${label}"`);
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

async function sendDueBillReminders(pktDate) {
  console.log(`Checking unpaid transactions due on: ${pktDate}`);

  const { data: dueItems, error: txError } = await supabase
    .from('transactions')
    .select('id, title, amount, due_date, user_id, is_paid')
    .eq('due_date', pktDate)
    .neq('is_paid', true);

  if (txError) {
    console.error('Database query error:', txError.message);
    process.exit(1);
  }

  console.log(`Found ${dueItems?.length ?? 0} due transaction(s).`);
  for (const item of dueItems ?? []) {
    await sendToUser(item.user_id, {
      title: 'Due Today: Rozana Hisaab 🔔',
      body: `${item.title} of PKR ${Number(item.amount).toLocaleString()} is due today!`,
      url: '/',
    }, item.title);
  }
}

async function sendExpectedBillReminders(pktDate) {
  console.log(`Checking bill connections whose next bill is expected on: ${pktDate}`);

  // Intervals are 1-12 months, so only last issues 27-370 days ago can match.
  const { data: connections, error } = await supabase
    .from('bill_connections')
    .select('user_id, provider, nickname, last_issue_date, billing_interval_months')
    .gte('last_issue_date', shiftDateKey(pktDate, -370))
    .lte('last_issue_date', shiftDateKey(pktDate, -27));

  if (error) {
    console.error('Bill connections query error:', error.message);
    process.exit(1);
  }

  const expectedToday = (connections ?? []).filter(
    (connection) =>
      getNextExpectedIssueDate(connection.last_issue_date, connection.billing_interval_months) === pktDate,
  );
  console.log(`Found ${expectedToday.length} bill(s) expected today.`);
  for (const connection of expectedToday) {
    const label = connection.nickname || connection.provider;
    await sendToUser(connection.user_id, {
      title: `${label}: new bill expected 📄`,
      body: 'Your next bill should arrive around now. Scan it in Rozana Hisaab when it comes.',
      url: '/',
    }, label);
  }
}

async function runDailyReminders() {
  console.log('--- Starting Daily Reminder Check ---');
  const pktDate = getPakistanDateKey();
  await sendDueBillReminders(pktDate);
  await sendExpectedBillReminders(pktDate);
  console.log(`Completed. Dispatched ${sentCount} notification(s).`);
}

runDailyReminders();
