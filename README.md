# Rozana Hisaab (روزانہ حساب)

Rozana Hisaab is a daily expense and bill management app for Pakistan. Track income and expenses, record transactions by voice, scan receipts, and keep due bills visible.

## Progressive Web App

The app is installable on supported desktop and mobile browsers. Open the deployed site in a compatible browser and choose **Install app** or **Add to Home Screen**. The service worker caches the application shell and static assets for offline launches. Transaction and profile data are cached locally so the dashboard remains useful when connectivity is unavailable; queued transactions sync when the device reconnects.

The PWA manifest and app icons are served from `public/manifest.json`, `public/icon.svg`, `public/icon-192.png`, and `public/icon-512.png`.

## Backend and data

Supabase provides authentication and the Postgres backend used for application data, including transactions and push notification subscriptions. Profile and transaction data are cached in the browser for offline use. Receipt images are stored locally in IndexedDB.

Row-level security scopes `transactions` and `push_subscriptions` to the signed-in user (`auth.uid()::text = user_id`); see `supabase/migrations/`.

AI features (voice and receipt scanning) go through the `ai-proxy` edge function, which requires a signed-in user, caps payload sizes, and rate-limits each user via the `ai_usage` table. The OpenAI key lives only in the function's secrets (`supabase secrets set OPENAI_API_KEY=...`), never in a `VITE_` variable.

Configure the required Supabase and VAPID values in the deployment environment. Do not commit secret keys or add them to client-exposed variables; only the Supabase URL, anon key, and VAPID public key belong in the client environment.

## Daily bill reminders

GitHub Actions runs `.github/workflows/daily-reminders.yml` every day at **09:00 Pakistan Standard Time (PKT)** (04:00 UTC). It sends push reminders to registered subscriptions for unpaid transactions due that day, and for saved bill connections ("My Bills") whose next bill is expected that day (one billing cycle, usually a month, after the last issue date). On Android, the app schedules the same expected-bill reminders as local notifications while daily reminders are switched on.

Add these repository Actions secrets to enable scheduled reminders:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

The workflow can also be started manually from the GitHub Actions tab.

## Local development

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

Useful checks:

```sh
npm run typecheck
npm run lint
npm run build
```
