# Business data snapshot

`supabase/business-data-export.sql` is a read-only, allowlisted export of the current catalogue, internal notes, staff membership metadata, sales, finances, commission terms, purchase costs, monthly invested-capital and business-expense settings, schedule, financial history and historical archive mapping. One statement reads one MVCC snapshot. It does not retrieve Auth credentials, application secrets or active sessions.

Run through the authorized Supabase SQL connector and save the returned `snapshot` JSON as `business-data.json` in private storage outside this repository. Validate the complete JSON and all expected tables; never save a truncated response as a successful backup. Do not publish business rows in a pull request, build output or a public artifact.

Verify the snapshot offline:

```sh
npm ci --prefix tests/schema --ignore-scripts --no-audit --no-fund
node scripts/verify-business-backup.cjs /absolute/private/path/business-data.json
```

The verifier restores the canonical schema and every exported row into an in-memory database, compares all fields and checks foreign-key references. It uses non-login Auth placeholders solely to validate references. It never connects to production, restores passwords, creates real users or sends email/bot messages. Package the JSON, successful verification result, exact schema baseline/migrations and a SHA-256 manifest in a private archive. Retain previous archives separately.

This is a **business-data recovery snapshot**, not a full service backup. It excludes Storage file bytes, Auth/MFA, server secrets, sessions/queues, analytics and catalogue change history. Keep the weekly source archive too. Restoring the live service requires verified platform backups, separate Storage object copies and account/secret recovery.

## Full recovery checkpoint

Use the project owner's Supabase dashboard to verify actual database backup dates and retention; CLI `supabase backups list --project-ref qhgzzhgxwpcctafpzjid --output json` requires a Management API credential. Do not ask staff to send credentials in chat.

1. Confirm the database backup includes Auth and the application's private schemas.
2. Save the actual private Storage objects independently, preserving bucket/path, content type and checksums. Database backups include file metadata, not those bytes.
3. Restore into a separate environment with email, live bot delivery and scheduled jobs disabled. Reconcile products, stock, sales, liabilities, staff roles and representative photographs.
4. Verify login/MFA recovery and record the successful test date, recovery point and time. Do not count the offline business-table test as full restoration.

The connected SQL tools cannot inspect backup retention or download private Storage bytes. The source backup automation remains useful; a successful source ZIP is not evidence that full recovery works.

Snapshot format 2 includes monthly_capital (13 tables). The verifier also accepts historical format 1 snapshots (12 tables) without inventing historical capital settings.
