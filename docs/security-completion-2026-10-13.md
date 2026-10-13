# Security completion — 2026-10-13

This release follows the fixes in PR #252. It does not claim the absence of all vulnerabilities.

## Administrative access

- Supabase Auth time-box is 12 hours. Strict database checks also enforce a 12-hour maximum and 30-minute idle lifetime on each protected operation, without waiting for JWT expiry or Auth cleanup.
- `store_private.admin_session_activity` belongs to a concrete Auth session. The heartbeat derives caller/session identity from verified JWT claims and uses server time. It cannot revive expired sessions, affect another user's session, or create access for an uninvited account.
- MFA/pending onboarding can report activity, but membership and existing MFA policies still gate private data and changes.
- The browser records trusted input, throttles activity requests, warns two minutes before expiry, and clears private UI state on expiry. Background statistics and token refresh do not count as activity. A sleeping tab cannot send a stale queued heartbeat to extend a session.
- A stolen active token can still be used until revoked/expired. An attacker possessing it can report activity within the 12-hour limit. Idle timeout is not a substitute for preventing token theft or MFA.

## Analytics ingress

- `/api/analytics` runs on the production Vercel project. It reads the protected `x-vercel-forwarded-for` header only, validates IPv4/IPv6 and canonicalizes IPv6. Missing/ambiguous values fail closed for analytics; browsing and purchasing links do not depend on collector success.
- Client-supplied `x-forwarded-for`, `cf-connecting-ip`, arbitrary body fields and claimed IPs are ignored.
- Daily HMAC fingerprints are computed in the server function. Raw IP, names, emails and Telegram identities are not placed in the analytics database by this code. Hosting-provider request logs have their own retention/access controls.
- Production-only `ANALYTICS_INGEST_SECRET` is stored as a Vercel Secret. The database stores only its SHA-256. The scoped RPC allows bounded ingestion only; no service-role key is needed on Vercel or in the browser. Do not log requests carrying the capability.
- The legacy Edge handler redirects accepted POST requests through the Vercel gateway and performs no direct database writes. JWT verification stays enabled.
- Existing distributed per-IP, visitor, session, minute and day quotas remain. A shared IP limit can omit statistics for users behind one network, but does not block the catalog or manager links.
- Consent remains required. Anonymous events are not verified humans; Telegram button clicks are not confirmed messages or orders. Distributed fake traffic remains possible within quotas.

Primary header contract: https://vercel.com/docs/headers/request-headers

## Retention and infrastructure

- `store-analytics-retention` runs daily at `15 20 * * *` UTC (03:15 Bangkok), independently of traffic. It deletes events/sessions older than 90 days, stale limiter entries, and its own cron history older than 30 days. Deletions use bounded batches; backlog/failure/missed-run health appears in admin analytics.
- Multiple actual cron executions succeeded on 2026-10-13; final schedule was restored to daily after the verification window. Recent data and products survive the rollback probes.
- Data API exposes `public` only. `store_private` is excluded; automatic table exposure is disabled. Removing `graphql_public` from the REST schema list is not a claim that every Supabase GraphQL service is disabled.
- `pg_net` was unused, had empty queues and no application callers, and was removed with RESTRICT. Its objects were owned by `supabase_admin`; application-role REVOKE did not remove the original owner's grants.
- GitHub main is protected by required `security-tests`. Other protection flags and all hosting-account MFA settings have not been independently certified.
- WAF rules target POST `/api/telegram` with absent/malformed webhook-secret headers. No broad IP blocking, sitewide Bot Protection challenge, or Attack Mode was enabled. Actual webhook secret authentication remains in the application.

## Reproducing verification

1. Run `node --test tests/*.test.cjs` (135 tests at this release).
2. Install the pinned Playwright version from `.github/workflows/responsive.yml`; run its 12 browser scripts. `tests/admin-session.browser.cjs` drives the actual login UI with controlled time and mocked server responses; it covers both deadlines, refresh, hidden data clearing, synthetic input and sleep.
3. In a disposable review database with the migrations installed, run `supabase/session-limits-retention-probes.sql`. It creates synthetic users/products inside a rollback-only subtransaction, verifies server deadlines, private RLS, pending invitations, retention and gateway capability, and rolls back all fixture writes on success. It also rolled back successfully against production during this audit.
4. Review cron job/run history and `store_private.analytics_retention_state` through the owner database connection. Test failures/missed execution in staging, then verify the admin warning.
5. With production credentials kept out of logs, independently test actual platform header overwriting, legacy redirects, legitimate shared-IP traffic and quota boundaries in staging. Unit tests cannot prove the hosting platform's ingress contract.
6. Independently retest account removal, owner/admin boundaries, invitation expiry, recovery + MFA, duplicate writes, reservation/quantity logic and Telegram webhook authentication. Do not send real customer messages as a test.

Supabase Advisor after the changes reported 15 INFO items for deliberately private RLS tables with no public policies and two WARN items for intentionally anonymous SECURITY DEFINER capabilities. Both capabilities require a separate server secret before privileged work. Do not remove those checks to silence the warnings.

Advisor explanation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Release / recovery order

1. Apply the five `20261013093422` through `20261013094126` migrations; they match the applied database history. The combined `session-limits-retention.sql` is a readable deployment recipe, not an extra migration to reapply.
2. Provision a fresh 32-byte hex ingestion secret in the production Vercel environment. Store only `sha256(convert_to(secret,'UTF8'))` in `store_private.analytics_gateway_secret`. Never put plaintext in source, a migration, tickets, or test output.
3. Verify SQL probes and a real cron run. Publish the frontend/server functions, then deploy the legacy Edge redirect. Verify production aliases, collector responses and the public catalog.
4. Frontend rollback to pre-heartbeat code is not fully compatible with the strict idle guard: old sessions will expire. Prefer a forward fix and preserve the server limits.

## Remaining human checks

- Confirm rotation of every credential previously disclosed outside its intended secret store. This audit did not request, read or reuse the database password and cannot establish whether that password was rotated.
- Confirm MFA/recovery ownership for GitHub, Vercel, Supabase and the email account; test restore from backups in an isolated environment.
- Have the independent reviewers inspect code/configuration and reproduce the above cases. Passing automated tests is evidence for the checked cases, not a complete security certification.
