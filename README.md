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

TOTP challenge handling is implemented for existing verified factors, including password recovery. New enrollment is disabled by default (`mfaEnrollmentEnabled` must be explicitly true). Do not enable it until a separately reviewed MFA database migration installs `enforce_store_mfa` and restrictive write policies. Sticky server enforcement, enrollment and legacy-invitation cleanup remain pending. Existing-factor UI challenges alone are not database enforcement.

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

The setup uses HTTPS requests to the official Telegram Bot API. It derives a separate webhook secret from the server token, authenticates incoming POSTs before reading their body, and never writes either secret to a file or a log. The webhook returns Telegram's `sendMessage` response directly. Telegram does not return a delivery result for this mode, and retried updates may cause duplicate greetings; this handler intentionally does not store chat history or claim exactly-once delivery.

Registration runs during the production build, before its new version is promoted. Telegram can briefly receive 503 during first activation or token rotation and retries failed webhook deliveries. Pending updates are not deleted. An invalid token, a different existing webhook, or a Telegram API error fails that deployment; the previous production site stays live. If activation fails after registration, fix the configuration and redeploy promptly.

To disable replies, remove the Production token and redeploy (incoming requests are then rejected). Also remove the webhook through Telegram's `deleteWebhook` with `drop_pending_updates: false` using an authorized secure admin environment. Removing the webhook alone permits a later configured production build to register it again.

Tests: `node --test tests/*.test.cjs`. Bot tests use fabricated credentials and mocked Telegram responses; they send no real messages.
