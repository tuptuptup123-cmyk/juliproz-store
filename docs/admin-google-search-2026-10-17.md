# Google Search Console in the admin

The admin's **Статистика → Google** tab reads the verified property
`https://www.juliproz.com/`. It shows organic web-search clicks, impressions,
CTR, average position, the preceding period, daily trends and up to ten leading
queries, pages and countries. It covers both language versions worldwide.

## Connection status

The UI and protected API are implemented. **Live Google API credentials have
not been provisioned yet.** The Google Cloud console returned "Site Unavailable"
in the available browser, including one reload. No Google service account or key
was created and no additional permissions were granted. Until connected, the
admin explicitly shows `Отчёт готов к подключению`, with a link to Search Console.
This is not a zero-traffic report.

## One-time connection

1. In the owner's Google Cloud project, enable **Google Search Console API**.
2. Create a dedicated service account named `juliproz-search-console`. It does
   not need project-wide IAM roles or domain-wide delegation.
3. In Search Console, property `https://www.juliproz.com/`, add its email under
   Settings → Users and permissions with **Restricted** read access.
   Do not grant ownership or broad access to other Google resources.
4. After the owner approves the credential/access setup, create a JSON key and
   save its complete JSON directly as the **sensitive, production-only** Vercel
   variable `GOOGLE_SEARCH_SERVICE_ACCOUNT` in project `juliproz-admin`
   (`prj_mlXa7WiZO3ohn7hXDOPhVmMci9sL`). Never place it in chat, source control,
   public configuration, browser storage or a preview deployment.
5. Redeploy the admin so the new server environment is applied. Open
   Статистика → Google → Обновить. Confirm a `ready` or `empty` response from the
   live Google API. An empty response is valid for a newly indexed property;
   `not_connected` means the credential is still missing.
6. Revoke the service account's Search Console access and key if the connection
   is no longer needed. Replacing a key requires updating the variable and a
   new admin deployment.

## Boundaries and security

- Existing `/api/admin` BFF POST envelope, HttpOnly session cookie, exact origin,
  CSRF token, active session, current membership and MFA/recovery-pause checks.
  Invitation/password-setup sessions cannot access reports.
- Authorization is rechecked even for cached reports. No database migration or
  new role permissions are needed. Staff access matches existing store analytics.
- The Google service-account JWT requests only `webmasters.readonly`. All Google
  requests have fixed endpoints, fixed property, timeout and redirect rejection.
  No client-selected property, token endpoint, scope or URL is accepted.
- Private key and access token remain server-only. Google error details are
  sanitized; provider 401/403 do not log the administrator out.
- Four allowed periods, request coalescing, a 15-minute in-process report cache,
  a short-lived token cache and one-minute error backoff limit upstream calls.
  Serverless instances have independent caches; this is not a global quota limit.
- Reports load only when the Google tab opens or its period changes; clicking
  refresh reuses a fresh server cache. No background cron or recurring job.
- Client requests are aborted/invalidated on logout and period changes. No
  report data is stored in localStorage. Links allow only the site's exact HTTPS
  origin; query labels and URLs are escaped.

## Interpretation

- “Вчера” means the previous **Pacific calendar day**, not a rolling 24 hours.
  Google uses `America/Los_Angeles`, including daylight-saving changes.
- 7/28/90-day ranges end yesterday, inclusive. The preceding comparison has
  equal length with no overlap. Data uses `all`; preliminary dates are labelled.
- Totals use a separate ungrouped request. Never sum top rows to obtain totals:
  Google omits anonymized queries and applies its own row/aggregation limits.
- Empty API data, disconnected state and upstream failures have separate UI
  states. Missing data/position is displayed as a dash, not invented zeroes.
- Search clicks are not unique people, manager contacts or confirmed sales.

## Verification

- `node --test tests/*.test.cjs`: 210 tests passed, including signed JWT/read-only
  scope, exact property, date/DST arithmetic, cache/coalescing, error redaction,
  missing credentials, malformed data, membership/MFA/CSRF/setup/session guards.
- `tests/admin-google-search.browser.cjs`: 320, 390 and 1280 px passed with real
  local BFF login/MFA and synthetic Google report responses. Covers lazy loading,
  period changes, comparison, drilldowns, escaping, connection/empty/error states,
  no page overflow and late-response logout protection. Synthetic test figures
  must not be reported as live business performance.
- Admin and public builds passed. New browser coverage is part of responsive CI.
- Live Google data cannot be verified until the one-time connection is complete.

References: [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query),
[service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account).
