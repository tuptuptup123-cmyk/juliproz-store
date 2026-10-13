# Seven-day administrator sessions

The owner explicitly requested a seven-day session and removal of inactivity logout after finding the original 12-hour / 30-minute policy disruptive.

## Behavior

- Seven days from the original sign-in, not seven days since the last click or token refresh.
- No inactivity deadline, activity listeners, heartbeat polling or “continue working” action.
- Normal verified administrator sessions are remembered on this device across reloads and reopening. Recovery sessions and sessions that have not passed membership/MFA checks are not saved.
- The saved record has an absolute deadline. Restore rechecks the live Auth user, session, membership and MFA before showing inventory. Reload, token rotation and cross-tab synchronization cannot reset the week.
- Manual logout removes the local record and ends the session; the existing logout-on-all-devices action remains.
- Bans, deleted users, explicit `not_after`, removed membership, revoked Auth sessions and MFA requirements retain their server enforcement.
- A warning appears two minutes before the fixed weekly deadline. On expiry the UI clears private data and requires sign-in again.

## Storage and tradeoff

The previous release deliberately kept credentials only in page memory, so it required sign-in after every reload. To implement the owner's week-long remembered login, verified sessions now use an origin-local `jpAdminSessionV2` record in localStorage. Passwords, recovery tokens and unfinished MFA/onboarding sessions are not persisted by this path. Legacy V1 credentials are discarded.

Persisted refresh credentials are accessible to same-origin JavaScript and to someone with access to the unlocked browser profile. Existing CSP and injection defenses remain essential. The seven-day server limit, account checks and revocation remain authoritative even if the local record is edited. A full HttpOnly-cookie backend session would require a separate architecture change; this release does not claim to provide one.

## Release prerequisites

1. Set Supabase Auth “Time-box user sessions” to **168 hours**, leaving native inactivity at **0 / never**. Keep the one-hour access token lifetime and refresh reuse detection unchanged.
2. Apply `supabase/admin-week-session.sql` as the `admin_week_session_without_idle_timeout` migration and save its actual migration-history version in the repository.
3. Run `supabase/session-limits-retention-probes.sql`; all fixtures roll back. It now verifies that six idle days are allowed and the exact seven-day boundary is denied, as well as the existing access, retention and ingestion checks.
4. Publish the admin assets and verify the production alias. Existing open tabs must reload to replace the old browser-side 30-minute timer. A prior session with an explicit earlier `not_after` may require one new sign-in.

The SQL function keeps its existing `touch_store_admin_session` RPC name for API stability but no longer records or requires activity. The old private activity table stays closed and unused; it is not needed for authorization.

## Verification

`node --test tests/*.test.cjs` covers the fixed deadline, malformed and expired saved records, verified restoration, revoked access and recovery isolation. Browser tests cover no logout after 30 minutes / 12 hours / six idle days, reload and reopening, short-lived token refresh, exact weekly expiry, private UI clearing and manual sign-out.

The historical security-completion report describes the earlier session policy. This document is the current requested policy and its deployment checklist.
