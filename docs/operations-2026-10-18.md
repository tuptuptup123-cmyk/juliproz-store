# Release and recovery operations

Evidence date: 18 October 2026. Audit base: `8c9c853c938ed79f7fac57396cafbaa31928e90f`.

The website, Telegram Mini App and single admin deploy independently from this repository. The chat webhook remains on the storefront backend. This audit follow-up changes no production database rows, financial records, secrets or employee membership.

## Existing database

`supabase/schema/manifest.json` is the canonical fresh-install order. The baseline and older setup/rollback scripts are not production updates. Compare migration SQL and target history before each release; do not infer a pending migration from its local timestamp alone.

| Local file identifier | Applied identifier observed in production | Migration |
| --- | --- | --- |
| 20261017082140 | 20261017085816 | remaining_audit_sessions_delivery_observability |
| 20261018051207 | 20261018051721 | analytics_acquisition_sources |

The other listed post-baseline migrations were present with matching identifiers. Historical files and migration history have intentionally not been renamed or replayed. Record any future divergence here with the exact SQL comparison.

## New empty project

1. Provision Supabase Auth, Storage, pgcrypto and pg_cron.
2. Restore the baseline and the manifest-listed migrations in order, then `freshProjectBootstrap`. Apply the manifest's post-deployment storage change at its documented stage.
3. Configure new server secrets and their private database hashes. Provision the first verified owner with TOTP. Keep open signup disabled.
4. Configure exact Auth callback origins and deploy Edge Functions from `supabase/functions` with their existing verification settings.
5. Deploy the three application roots using Node 24 and their Vercel configuration. Include files outside the root for admin and Mini App. Configure independent test domains; do not reuse the live bot token for a recovery rehearsal.
6. Run schema probes against synthetic records and verify anonymous/member/owner boundaries before loading production data.

## Backups and recovery — verification outstanding

A source ZIP and a schema reconstruction do not back up live data, authentication records or Storage objects. The audit did not establish backup retention, PITR availability, or a successful restoration of real files and records.

The project owner should record the last successful database backup, retention, recovery point objective and recovery time objective. Check Storage file preservation separately. Restore into an isolated project, with mail/webhooks/delivery jobs disabled there. Compare counts, sample photos, stock, sales and commission records; check owner/member access and MFA recovery. Record the restore date, duration, validation results and operator. Do not mark this complete from a schema-only test.

For an additional private snapshot of actual business rows, use the [business data export and offline restore verification](backup-business-data.md). This supplements source and platform backups; it does not include Auth or Storage file bytes.

## Authentication settings — verification outstanding

The browser form and BFF enforce a 12-character minimum. `supabase/rollout/auth-settings.json` records desired platform settings. Use `scripts/check-auth-settings.cjs` with an operator-supplied Management API credential to read actual settings; it prints only comparisons. `--apply` changes the settings and must be part of an intentional operations change, not a normal frontend build. Never put the credential in source, browser config or screenshots. Verify recovery on an isolated account without disrupting staff sessions.

## Release checks

- `node --test tests/*.test.cjs`.
- Canonical schema reconstruction for database changes.
- Browser workflow, including `tests/audit-followup.browser.cjs`, then production route/header/HTML checks on the merged commit.
- Public build must not ship static `terms.html` or `privacy.html`: their handlers render the chosen language. Vercel must include the two templates and reviewed translation modules in the legal-page function.
- Validate RU/EN, a 320 px phone viewport, a desktop viewport, product reload/Back/Forward, exact size/colour, More navigation and preserved cart.
- Confirm three intended projects and their current source commits before release. Recheck actual published aliases after deployment.

## Content and accounting follow-up

The private audit report lists cards needing descriptions, additional photographs, structured wear grades and legacy-status classification. Managers must confirm facts from the actual item. Do not invent model details, extra images, condition grades or sale amounts to clear a counter.

Before relying on the financial journal, record actual sales, costs and commission liabilities, then reconcile to payments. Legacy does not mean sold. The existing whole-euro policy remains; no automatic currency-unit conversion or historical rounding has been introduced. Merchant identity, country and legally reviewed terms require verified owner information.
