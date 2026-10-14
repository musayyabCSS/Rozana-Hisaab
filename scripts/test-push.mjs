import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadEnvFile() {
  try {
    return parseEnv(await readFile(resolve(projectRoot, '.env'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function errorStatus(error) {
  return error?.statusCode ?? error?.status ?? error?.code;
}

async function main() {
  const fileEnv = await loadEnvFile();
  const getEnv = (key) => process.env[key] || fileEnv[key];
  const required = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
  ];
  const missing = required.filter((key) => !getEnv(key));
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  const supabase = createClient(
    getEnv('VITE_SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  webpush.setVapidDetails(
    'mailto:support@cssestimation.com',
    getEnv('VITE_VAPID_PUBLIC_KEY'),
    getEnv('VAPID_PRIVATE_KEY'),
  );

  const { data: subscription, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!subscription?.endpoint || !subscription.p256dh || !subscription.auth) {
    throw new Error('No complete push subscription was found.');
  }

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify({
      title: 'Rozana Hisaab Test 🔔',
      body: 'Push notifications are working end-to-end!',
      url: '/',
    }),
  );

  console.log('Test push notification delivered successfully.');
}

main().catch((error) => {
  const status = errorStatus(error);
  if (status !== undefined) {
    console.error(`Push test failed (status ${status}): ${error.message}`);
  } else {
    console.error(`Push test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
