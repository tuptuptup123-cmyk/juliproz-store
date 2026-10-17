# JULI.PROZ Store

Telegram Mini App: https://t.me/JuliProzBot/shop

Vercel storefront with server-side catalog, analytics and photo gateways using Supabase `public.products`. Existing storefront colors, typography and layout are retained. No npm dependencies are required. The production build configures the Telegram webhook when its server token is present.

## Catalog and product links

The storefront loads available products in batches, supports search, filters and favorites, and displays an image gallery. Invalid or broken cover URLs display the existing J.P placeholder.

Every product has a link `https://t.me/JuliProzBot/shop?startapp=p_<id>`. The app reads Telegram's start parameter or `?product=<id>` when opened directly on the website. Sold or unavailable products show an unavailable message. The purchase button opens `@juliproz` with a draft containing the product name, size, ID and product link. The customer presses Send; the app does not send messages on their behalf.

## Admin

Open `/admin.html`. Sign in using an authorized Supabase Authentication account. Add or edit brand, name, category, size, price, currency, description and availability. Upload multiple JPG, PNG or WebP images up to 6 MB each, select a cover, or add existing image URLs. Remove a listing from availability without deleting its record or changing its ID.

Completed admin logins use an opaque host-only `__Host-jp-admin` cookie (HttpOnly, Secure, SameSite=Strict) on `admin.juliproz.com`. The same-origin `/api/admin` gateway keeps encrypted Supabase access/refresh tokens in a private database vault. Browser storage contains only non-secret account/session IDs and the fixed deadline. The lifetime is 30 days from the original Auth session creation, with no inactivity timeout; refresh cannot extend it. Server leases serialize refresh and MFA updates across tabs/instances. Reload validates the server session, membership, MFA policy and user identity before showing inventory. A one-time same-origin upgrade removes the old plaintext token record and exchanges it server-side. All authenticated operations retain the user's JWT and Supabase RLS; the gateway never uses service-role credentials. `ADMIN_SESSION_SECRET` must be a separate production-only 64-character hex secret, with its SHA-256 hash in `store_private.admin_bff_secret`. See [the remaining audit release](docs/remaining-audit-2026-10-17.md) for operations and limitations.

### Canonical database setup and current audit review

The authoritative schema order is `supabase/schema/manifest.json`. Full findings, validation boundaries and production rollout order are in `review/EXTERNAL_AUDIT_FIXES.ru.txt`; reproducible commands are in `review/REPRODUCE.txt`.

For a **fresh Supabase project**, restore `supabase/schema/baseline-20261016.sql`, then only the migrations listed in the manifest, then the fresh-project platform bootstrap. Auth, Storage, pgcrypto and pg_cron are platform dependencies. Provision the first confirmed owner with verified TOTP and new server secrets separately. No production data or credentials are included.

For the **existing project**, do not restore the baseline or replay historical setup scripts. Apply only the new `20261016144421_external_audit_security_and_logic.sql` once, then coordinate Edge/front-end deployment and the post-deployment private-bucket change as documented. This review branch has not applied these changes to production. Auth password-policy settings require separate Management API verification.

A static-folder upload is incomplete: the website also needs its API handlers and `private-product-assets/**` function bundle, and Mini App needs its analytics relay. The old root-level SQL and earlier migrations below document historical changes, not an installation sequence.

## Reliability and account recovery

Revision, creation-key, membership, recovery and MFA controls are included in the canonical baseline. Public signup must stay disabled. Invitation emails do not grant membership; after confirmed email and TOTP enrollment the owner approves team access.

The editor updates only changed fields and requires the original revision to match. A concurrent change produces a conflict instead of overwriting inventory. New-card retries reconcile the same creation key. Upload retries reuse object paths, decode and resize images to WebP, preserving transparency and discarding metadata. Removed gallery links do not delete shared stored files; automatic storage deletion is deliberately not enabled.

Password recovery uses Supabase email and a new-password form (minimum 12 characters, also enforced by the gateway). Verified-factor accounts must complete MFA before changing a password. Accepted invitation/recovery progress is stored server-side until the password is saved, so reloading resumes setup. An unfinished session has a browser-session cookie; the persistent 30-day cookie is issued only after full access checks. No auth JWT or refresh token is returned by the gateway. Temporary failures preserve the session and editor for retry. Admin HTML and authenticated responses are no-store; only content-addressed public admin assets receive long-lived caching.

Validation: `node tests/store.test.cjs` and `node --test tests/swipe.test.cjs`.


## Security controls

The additive migration `supabase/security-safe-fixes.sql` is applied to production. It validates required text, finite prices and photo limits, and installs a private change log. Boutique-price cards retain `price=null`. Existing rows and permissions were preserved. `security-safe-rollback.sql` removes only the new constraints and triggers while retaining audit history.

The additive migration `supabase/mfa-enforcement.sql` is applied before enabling `mfaEnrollmentEnabled` in config. Restrictive policies require AAL2 for catalog writes, hidden inventory and photo uploads once an administrator has a verified MFA factor. Enrollment calls `enforce_store_mfa` with the verified AAL2 session to persist this requirement even if factors are later removed. Existing administrator membership policies remain required. Unenrolled administrators retain access until enrollment; MFA is not complete until the owner connects an authenticator in the admin page. Add a backup authenticator before losing access to the first. If all factors are lost, project-owner recovery is required; password reset does not bypass MFA. The migration removes excess staging-table grants and enables private staging RLS without deleting upload data or invitation records. `mfa-probes.sql` verifies isolation with synthetic users inside a rolled-back transaction. `mfa-enforcement-rollback.sql` documents owner-only emergency policy rollback, retaining enforcement history.

Product and admin-membership changes are logged in `store_private.store_change_log`. Browser roles cannot read, edit or delete the log. Trusted SQL can inspect actor_id, time and before/after rows. Database administrators retain their normal privileges; the log is not tamper-proof against them. Remove secrets from product fields, even though this audit log is private.

Logout revokes the current server session with `scope=local`, always clears forms and memory, and distinguishes a server failure from confirmed sign-out. Logout deletes the opaque server session before revoking Supabase Auth. Other tabs clear their private UI through the shared non-secret coordination record. A deleted/revoked Auth session is rejected by the gateway even if an old access JWT has not expired. An API 401 clears editor and enrollment state.

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

The webhook authenticates Telegram before parsing its body or calling the shared limiter. `supabase/telegram-distributed-limit.sql` adds a secret-authenticated atomic admission RPC backed by private RLS tables. Limits are fixed UTC windows: 600 accepted actions/minute across the bot, 20,000/day, five replies/chat/minute, and 30 button taps/chat/minute. Update IDs are deduplicated for 24 hours across instances and routes. Chat IDs are HMAC-hashed with the server bot token; messages and raw chat IDs are not stored. Expired counters are removed on the next valid admission request. These are fixed windows, so adjacent window boundaries can permit bursts. This bounds accepted bot actions, not incoming Vercel invocation costs or network DDoS traffic.

Deployment order: (1) apply the additive SQL; (2) generate a 256-bit random hex secret, store only its SHA-256 hash in `store_private.telegram_limit_secret`, and set `TELEGRAM_LIMIT_SECRET` as a **Production-only Secret** in the existing storefront Vercel project, never in browser config, previews, logs, or Git; (3) deploy this code; (4) verify live `/start` and navigation with the owner. Without that credential or when the admission database fails, valid bot actions return 503 with Retry-After and do not call Telegram; there is no memory-only fallback. Rate-limited and duplicate updates return 200 without a reply to prevent retry storms. The warm-instance guard remains an additional conservative check. Atomic admission is not exactly-once delivery: a crash after admission can lose an answer. Deploy only after the shared secret and its database hash are configured. `telegram-limit-probes.sql` checks SQL in isolated disposable schemas; handler tests exercise cross-instance integration with mocked admission.

Registration runs during the production build, before its new version is promoted. Telegram can briefly receive 503 during first activation or token rotation and retries failed webhook deliveries. Pending updates are not deleted. An invalid token, a different existing webhook, or a Telegram API error fails that deployment; the previous production site stays live. If activation fails after registration, fix the configuration and redeploy promptly.

To disable replies, remove the Production token and redeploy (incoming requests are then rejected). Also remove the webhook through Telegram's `deleteWebhook` with `drop_pending_updates: false` using an authorized secure admin environment. Removing the webhook alone permits a later configured production build to register it again.

Tests: `node --test tests/*.test.cjs`. Bot tests use fabricated credentials and mocked Telegram responses; they send no real messages.

## Audit fixes (2026-10-09)
Apply `supabase/audit-fixes.sql` after the existing schema. The one-time `retire-empty-upload-staging.sql` removes obsolete staging tables only if empty. It retires automatic enrollment privileges, adds the private MFA status RPC and separates analytics salt from the service key. Existing admin membership and MFA pause are preserved until the owner verifies TOTP in Settings → Security; successful AAL2 activation removes the owner's pause atomically. Do not apply legacy pause/rollback scripts to install this release.

The admin Delete action intentionally deletes a product permanently after confirmation; existing product links then become unavailable. The private change log keeps the audit record. Photo objects are retained. Cart checkout is a manager request, not an atomic stock reservation or paid order.

Analytics starts only after consent; rejection/revocation removes local analytics IDs and stops new events. Totals reflect consenting devices only. Ingest limits: 2,400 requests/min globally, 250,000/day globally, 600/min and 20,000/day per IP fingerprint, 120/min per visitor, 300 new sessions/min globally and 150/min per fingerprint. Origin and IP headers are not authentication; global limits bound traffic even if IP is forged. The privacy notice describes implemented behavior and should receive legal review for the store's jurisdictions.

Public signup was verified disabled through Auth settings. Dashboard-only actions still needed: set password minimum 12 and enable leaked-password protection if the plan supports it. These settings cannot be changed through the connected database tools.


## Audit corrections — 13 October 2026

Apply `supabase/migrations/20261013054144_audit_security_and_logic_fixes.sql` before deploying the changed admin or Edge functions. Historical migration note (superseded by the current 30-day session implementation): that release used document-memory tokens. Current completed logins survive reloads and new tabs for 30 days; incomplete MFA and recovery sessions remain in memory. Legacy credential formats are removed. Invite/recovery links explicitly confirm the target email and cannot silently replace another active account.

Invitation email delivery does not grant membership. The invited user confirms email, sets a password and enrolls TOTP, then waits for the owner to approve access. Existing accounts also require verified email and TOTP before an owner can add them. Only the owner can permanently delete products; ordinary administrators can mark them sold or hidden. MFA and active server sessions remain required.

Checkout drafts retain each selected variant and its quantity alongside the canonical product link, with no prices. Analytics validates published product IDs and reports pressure at 80% of global limits. Anonymous event counts can still be fabricated and are not proof of messages, orders or individual humans. Per-IP limits depend on trusted proxy behavior, which needs a separate live verification. Consent withdrawal stops new collection; the previous visitor reference can be copied while the page stays open to support a deletion request.

Telegram local admission now precedes shared admission and refunds local reservations on refusal/outage. UTC daily caps are 100 messages or 500 callbacks per chat, in addition to existing global caps. Many-account attacks can still exhaust global availability. The obsolete exchange-rate endpoint returns 410 without contacting an external service. Historical import Edge functions are source-controlled 403 stubs; the retired upload function returns 410.

Current regression probes: `supabase/audit-security-probes.sql`. Legacy MFA probes describe the earlier enrollment policy and are not the current acceptance check. Do not run historic setup/rollback scripts against an installed production database as routine maintenance.

### Separate storefront analytics

One admin serves both storefronts. Statistics defaults to **Website** and can switch to **Bot** (the Telegram shop) or the unclassified legacy archive. The period, cards, chart, contact breakdown and product rankings use the selected channel. The compact home overview remains labelled as all channels.

The collector remains consent-based. The gateway derives the channel from verified Telegram initData, ignores client channel hints, namespaces sessions by channel and retains ingestion limits. The separate Mini App relay signs its trusted client IP and request body using ANALYTICS_RELAY_SECRET. Ordinary anonymous requests are website traffic; existing historical rows are not relabelled. Bot chat commands, message contents and Telegram profiles are not stored in analytics.

Apply `supabase/migrations/20261015030634_analytics_storefront_channels.sql` before releasing the gateway and admin. Old RPC signatures remain compatible during rollout. The private analytics tables retain admin-only RLS and the existing 90-day retention. Run `supabase/analytics-channel-probes.sql` inside a rolled-back transaction to verify channel isolation, replay safety and access checks.

### Manager upload schedule

The private admin has a daily rotation: one approved manager per day, with a target of ten new product cards. Calendar days use `Europe/Kyiv`, matching the supplied team timetable. The initial rotation contains current non-owner admin accounts, ordered by display name; owners can edit its order from a chosen current/future date or replace one day's manager. Older rotation versions remain intact. A day replacement does not advance or shift the underlying rotation.

Counts use the first qualified publication in the server-side audit: available=true with brand, name, category and cover. Hidden drafts do not count. Credit belongs to the publishing manager on the Kyiv publication date; editing and republishing do not count again. Deleted cards are listed separately and excluded from the target; hidden and sold cards retain their credit. System uploads have no manager attribution. Monthly totals include uploads outside assigned duty, while daily completion uses only the assigned manager. Cards predating available creation audit cannot be attributed retroactively.

Migration `20261015102752_manager_upload_schedule.sql` adds private RLS-protected schedule tables, guarded RPCs and an upload index. Reads require active membership/session/MFA; changes require the owner's second factor and revision checks. No raw product audit payloads or employee notes are returned by these RPCs. The original July sheet remains unchanged; its ambiguous historical date grid is not imported.

Run `supabase/upload-schedule-probes.sql` for rollback-only synthetic permission, attribution, date boundary and concurrency checks. `tests/admin-schedule.browser.cjs` covers owner/staff controls, mobile layouts, replacements, queue order, private cleanup and load failures.
