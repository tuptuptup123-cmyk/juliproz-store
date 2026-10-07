# JULI.PROZ Store

Telegram Mini App: https://t.me/JuliProzBot/shop

Static Vercel storefront using Supabase `public.products`. Existing storefront colors, typography and layout are retained. No package build step is required.

## Catalog and product links

The storefront loads available products in batches, supports search, filters and favorites, and displays an image gallery. Invalid or broken cover URLs display the existing J.P placeholder.

Every product has a link `https://t.me/JuliProzBot/shop?startapp=p_<id>`. The app reads Telegram's start parameter or `?product=<id>` when opened directly on the website. Sold or unavailable products show an unavailable message. The purchase button opens `@juliproz` with a draft containing the product name, size, price, ID and product link. The customer presses Send; the app does not send messages on their behalf.

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
