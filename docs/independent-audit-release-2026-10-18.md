# Installation of the independent audit fixes

This source version includes the earlier audit fixes and the follow-up changes. A local archive is not a deployed release. Publication and live database changes must be coordinated.

Apply `supabase/migrations/20261018085636_independent_audit_fixes.sql` before publishing the website and admin code. It adds `name_en` and `description_en`, grants only the matching column permissions, invalidates old translations when their source text changes, and restores the reservation flag when voiding a sale. It does not rewrite historical sales or existing product descriptions. The schema snapshot and restore manifest include the migration.

Verify the migration on an isolated database using `tests/schema/run.cjs`. The checks cover owner and manager permissions, both reservation states, original stock quantities, English column permissions, translation invalidation, financial reporting, sessions and analytics. Platform fixtures are for tests only and must never be applied to production.

Deploy the `product-photo` Edge Function separately from the three Vercel projects. Anonymous image requests must pass the current publication check before a conditional 304 response is allowed. Authenticated requests and denials remain `no-store`; there is no day-long public image cache. The website, bot and admin keep their existing public/private data boundaries.

The new editor offers English name and description fields. Known phrases still use reviewed translations. Unknown text requires a reviewed translation before a new or changed visible card is published through this editor. A card can be saved hidden while the translation is prepared. Existing unrelated stock/price edits are not blocked solely because a legacy translation is missing. External importers must also supply English fields when their text is outside the reviewed dictionary; the editor cannot enforce the workflow for a separate importer.

Stock-bearing HTML and sitemap responses are revalidated against current public data before a 304. Only static home, service and legal pages have a short CDN cache. The legacy-host redirect applies to website routes only; images, the bot webhook and the legacy Mini App route are excluded. Verify host-conditional redirects on Vercel after deployment because a local static server does not emulate Vercel routing.

Run the Node test suite, schema probes, and the browser suites for `audit-followup`, `product-translation`, `site-language`, `seo`, `catalog-notice`, `action-guards` and `separate-storefronts`. The new browser suite uses synthetic records and never writes to the production database. Real-device Safari/Android and the full photo-editor runtime download remain separate release checks.

For rollback, keep the additive English columns and roll back the application deployments. Do not drop translation columns or rewrite the financial ledger to roll back frontend changes. Keep the corrected sale-reversal function unless a specifically diagnosed regression requires replacing it.
