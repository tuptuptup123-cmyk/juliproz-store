# JULI.PROZ Store

Telegram Mini App: https://t.me/JuliProzBot/shop

Static Vercel storefront using Supabase `public.products`. Existing storefront colors, typography and layout are retained. No npm dependencies are required. The production build configures the Telegram webhook when its server token is present.

## Catalog and product links

The storefront loads available products in batches, supports search, filters and favorites, and displays an image gallery. Invalid or broken cover URLs display the existing J.P placeholder.

Every product has a link `https://t.me/JuliProzBot/shop?startapp=p_<id>`. The app reads Telegram's start parameter or `?product=<id>` when opened directly on the website. Sold or unavailable products show an unavailable message. The purchase button opens `@juliproz` with a draft containing the product name, size, ID and product link. The customer presses Send; the app does not send messages on their behalf.

## Admin

Open `/admin.html`. Sign in using an authorized Supabase Authentication account. Add or edit brand, name, category, size, price, currency, description and availability. Upload multiple JPG, PNG or WebP images up to 6 MB each, select a cover, or add existing image URLs. Remove a listing from availability without deleting its record or changing its ID.

Sessions are kept only in memory. Supabase RLS validates every read/write; hiding the admin UI is not an authorization mechanism. A publishable key in `config.js` is expected; do not place database passwords, service-role keys or bot tokens in browser files.

### One-time Supabase setup

1. Inspect current product policies and apply `supabase/setup.sql` in the existing project. The migration adds `photos`, creates an admin allowlist and Storage bucket, and replaces product policies with public availability reads and admin writes. It preserves product records. Review any custom policies before applying.
2. Create or invite the owner through Supabase Authentication using their email. Passwords are managed through Supabase Auth; the database password is unrelated.
3. Add the user's Auth UUID to `public.store_admins` using the commented insert at the end of the migration. Only project administrators can change this allowlist.
4. Deploy these static files to the existing Vercel project. Verify admin login, add/edit/hide/restore, photo upload, public reads and denial of anonymous writes.

The migration must be applied and an admin user registered before the admin panel works. A GitHub deployment alone does not configure Supabase.

## Reliability and account recovery

Apply SQL in order: `setup.sql`, `catalog-hardening.sql`, then `catalog-reliability.sql`. The reliability migration adds a server-managed revision and a unique creation key. Apply it before deploying the admin UI. Existing owner membership is preserved; automatic email enrollment is retired. Public signup should be disabled in Supabase Auth settings. Invite new administrators through the dashboard, then add their UUID to `store_admins`.

The editor updates only changed fields and requires the original revision to match. A concurrent change produces a conflict instead of overwriting inventory. New-card retries reconcile the same creation key. Upload retries reuse object paths, decode and resize images to WebP, preserving transparency and discarding metadata. Removed gallery links do not delete shared stored files; automatic storage deletion is deliberately not enabled.

Password recovery uses Supabase's recovery email and a new-password form (minimum 12 characters). Sessions are memory-only, concurrent refreshes share one request, and a failed refresh closes the workspace. Network calls time out after 20 seconds. The admin page disallows framing and caching; the storefront retains Telegram framing support.

Validation: `node tests/store.test.cjs` and `node --test tests/swipe.test.cjs`.


## Security controls

The additive migration `supabase/security-safe-fixes.sql` is applied to production. It validates required text, finite prices and photo limits, and installs a private change log. Boutique-price cards retain `price=null`. Existing rows and permissions were preserved. `security-safe-rollback.sql` removes only the new constraints and triggers while retaining audit history.

The additive migration `supabase/mfa-enforcement.sql` is applied before enabling `mfaEnrollmentEnabled` in config. Restrictive policies require AAL2 for catalog writes, hidden inventory and photo uploads once an administrator has a verified MFA factor. Enrollment calls `enforce_store_mfa` with the verified AAL2 session to persist this requirement even if factors are later removed. Existing administrator membership policies remain required. Unenrolled administrators retain access until enrollment; MFA is not complete until the owner connects an authenticator in the admin page. Add a backup authenticator before losing access to the first. If all factors are lost, project-owner recovery is required; password reset does not bypass MFA. The migration removes excess staging-table grants and enables private staging RLS without deleting upload data or invitation records. `mfa-probes.sql` verifies isolation with synthetic users inside a rolled-back transaction. `mfa-enforcement-rollback.sql` documents owner-only emergency policy rollback, retaining enforcement history.

Product and admin-membership changes are logged in `store_private.store_change_log`. Browser roles cannot read, edit or delete the log. Trusted SQL can inspect actor_id, time and before/after rows. Database administrators retain their normal privileges; the log is not tamper-proof against them. Remove secrets from product fields, even though this audit log is private.

Logout revokes the current server session with `scope=local`, always clears forms and memory, and distinguishes a server failure from confirmed sign-out. A successful logout does not promise immediate revocation of already-issued access JWTs. An expired refresh token or API 401 clears local editor and enrollment state.

GitHub Actions `security-tests` runs on PRs and main with read-only repository permissions and pinned official actions. Require this check in branch protection/rulesets after it has run successfully. Dashboard settings for signup, password strength, leaked-password protection, SMTP, redirect URLs, account MFA and deployment protection require separate verification; this migration does not modify them.

The admin CSP applies to `/admin`, `/admin.html` and `/admin/`, blocks framing and caching, and allows data images solely for the MFA QR. The storefront CSP remains unchanged.

Validation: `node --test tests/*.test.cjs`. Production database write probes run in a transaction ending in ROLLBACK; they leave no test products or audit events. Identity sequences may advance during those probes.


## Telegram chat bot

`api/telegram.js` handles private messages to @JuliProzBot. `/start` returns the JULI.PROZ welcome and buttons for the existing shop and @juliproz. `/shop`, `/help` and `/manager` work too. Other text explains how to contact the manager; it is not silently forwarded. Group/channel messages, edits and service events are ignored. No conversation database or AI service is involved.

### Activate once

1. In BotFather, select @JuliProzBot and copy its existing API token. Never put it in GitHub, browser JavaScript, screenshots or chat.
2. In the existing Vercel project, Settings → Environment Variables, save `TELEGRAM_BOT_TOKEN` as a Sensitive variable for **Production only**.
3. Redeploy the current main deployment. `scripts/configure-telegram.cjs` checks the bot identity and installs the webhook automatically. Existing integrations at a different webhook URL are refused rather than overwritten. Previews, local builds and builds without a token do not change Telegram. Vercel system environment variables must be enabled so `VERCEL_ENV` is available.
4. After the production deployment is Ready, send `/start` to @JuliProzBot. Confirm the greeting and both buttons. `/api/telegram` reports `configured: true` only when the production runtime has a valid-format token; this does not independently prove message delivery.

The setup uses HTTPS requests to the official Telegram Bot API. It derives a separate webhook secret from the server token, authenticates incoming POSTs before reading their body, and never writes either secret to a file or a log. The webhook returns Telegram's `sendMessage` response directly. Telegram does not return a delivery result for this mode, and retried updates may still cause duplicate greetings across instances or restarts. A bounded, in-memory guard suppresses repeated update IDs for five minutes and permits five replies per chat per minute within one warm instance. It stores only temporary IDs and counters, never message text. Suppressed updates receive HTTP 200 to avoid retry storms. This is best-effort abuse reduction, not a distributed rate limit, exactly-once delivery, or Vercel cost protection. A shared atomic limiter and platform-level limits remain necessary for those guarantees; current Vercel project authorization does not permit configuring them.

Registration runs during the production build, before its new version is promoted. Telegram can briefly receive 503 during first activation or token rotation and retries failed webhook deliveries. Pending updates are not deleted. An invalid token, a different existing webhook, or a Telegram API error fails that deployment; the previous production site stays live. If activation fails after registration, fix the configuration and redeploy promptly.

To disable replies, remove the Production token and redeploy (incoming requests are then rejected). Also remove the webhook through Telegram's `deleteWebhook` with `drop_pending_updates: false` using an authorized secure admin environment. Removing the webhook alone permits a later configured production build to register it again.

Tests: `node --test tests/*.test.cjs`. Bot tests use fabricated credentials and mocked Telegram responses; they send no real messages.

## Audit fixes (2026-10-09)
Apply `supabase/audit-fixes.sql` after the existing schema. The one-time `retire-empty-upload-staging.sql` removes obsolete staging tables only if empty. It retires automatic enrollment privileges, adds the private MFA status RPC and separates analytics salt from the service key. Existing admin membership and MFA pause are preserved until the owner verifies TOTP in Settings → Security; successful AAL2 activation removes the owner's pause atomically. Do not apply legacy pause/rollback scripts to install this release.

The admin Delete action intentionally deletes a product permanently after confirmation; existing product links then become unavailable. The private change log keeps the audit record. Photo objects are retained. Cart checkout is a manager request, not an atomic stock reservation or paid order.

Analytics starts only after consent; rejection/revocation removes local analytics IDs and stops new events. Totals reflect consenting devices only. Ingest limits: 120 requests/min globally, 10,000/day globally, 30/min per IP fingerprint and visitor, 20 new sessions/min globally and 5/min per fingerprint. Origin and IP headers are not authentication; global limits bound traffic even if IP is forged. The privacy notice describes implemented behavior and should receive legal review for the store's jurisdictions.

Public signup was verified disabled through Auth settings. Dashboard-only actions still needed: set password minimum 12 and enable leaked-password protection if the plan supports it. These settings cannot be changed through the connected database tools.
