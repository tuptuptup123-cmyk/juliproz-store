# Technical cleanup — 20 October 2026

Baseline: main a6e5fbdebc79b70cfaca1ee6a2948adcf6cd1517. Scope: source files, runtime dependencies, three build outputs, business/operational database tables, photo references and saved archive inventory.

## Changes

- Removed 41 obsolete source images (3,097,844 bytes). None is referenced by current product cards, product change history, the 442-item private photo bundle manifest, or tracked source/documentation. Three unused editorial images were previously copied by the broad editorial-directory rule. Git history retains every removed file.
- Removed eight unused WOFF fonts (420,112 bytes). All eight WOFF2 fonts used by fonts.css remain. Total removed: 49 files, 3,517,956 bytes. This reduces the current source/archive footprint; it does not rewrite Git history.
- Removed the nonexistent styles.css entry and duplicate ignore rule. Public/admin builds now fail on a missing declared asset instead of silently publishing an incomplete build.
- Added runtime-errors.js, transitive Telegram authentication code and package manifests to the Telegram build trigger, preventing skipped required rebuilds.
- Updated the existing hourly maintenance function: completed logs for this job retain 30 days; expired Telegram deduplication/counter rows expire even without new traffic; bot delivery leases are respected during cleanup; only terminal queue rows can be deleted. Added a two-second lock timeout. Access remains unavailable to anon, authenticated and service_role.

## Database and asset findings

- 34 application tables have RLS. No identical indexes or unvalidated application constraints were found. Database size at inspection was about 26 MiB, without a demonstrated need for disruptive VACUUM FULL or index rebuilding.
- All 282 distinct current Storage references exist. 814 objects occur in historical product changes. Five files, totalling 699,752 bytes, have no current/historical product reference; these are candidates only and were retained because a complete verified Storage backup is still outstanding.
- Current product data, sales, financial entries, catalogue change history and the 414-row archive-migration backup were byte-normalized and hashed before/after production maintenance; all five hashes remained identical.
- Empty commission_terms and product_costs tables are required features, not obsolete tables. Sold, hidden, legacy cards and historical photos were retained. The existing expired invitation was retained as account-management history.
- Existing security-advisor notices remain: private RLS tables intentionally have no direct browser policies; five public security-definer signatures are secret-guarded analytics/bot entry points. This cleanup adds no public privilege.

## Verification

- 258 unit/server tests passed.
- Canonical PGlite schema restore and all existing permission/role probes passed, plus new expiry, live-lease, unrelated-cron and business-history preservation probes.
- All three local builds passed. All 442 declared private product assets were staged successfully.
- Telegram separation/browser checks passed at 320, 390, 768 and 1440 px, including independent origin, notice, cart and privacy behavior.
- npm audit --omit=dev reported zero known vulnerabilities in the runtime dependency tree. This is a registry check, not a guarantee of absence of vulnerabilities.
- Production maintenance function body matches local MD5 da0dc82389e9ab09b25c360ff074b3ee; expired deduplication/counter rows were removed.

## Archive boundary

17 named ZIP artifacts were found. Existing backups and historical releases are preserved. Reading archive bytes through the available file connection failed with HTTP 403. Full content/CRC/secret checks of those historical ZIPs remain unverified; metadata alone does not prove an archive is clean. The business snapshot created earlier today was already restored and verified offline in the preceding audit.

## Removed source files

- `images/chanel-black-gold-375-cover.webp` (300060 bytes)
- `images/chanel-gum-sneakers-back.webp` (81956 bytes)
- `images/chanel-gum-sneakers-cover.webp` (61906 bytes)
- `images/chanel-gum-sneakers-detail.webp` (164564 bytes)
- `images/chanel-gum-sneakers-side.webp` (54160 bytes)
- `images/chanel-quilted-cc-beige-detail.webp` (22956 bytes)
- `images/chanel-quilted-cc-beige-heel.webp` (24712 bytes)
- `images/chanel-quilted-cc-beige.webp` (18084 bytes)
- `images/editorial/hermes-boutique-team.webp` (123604 bytes)
- `images/editorial/hermes-constance.webp` (11672 bytes)
- `images/editorial/hermes-kelly.webp` (95452 bytes)
- `images/fendi-roma-white-S-back-transparent-v2.webp` (29966 bytes)
- `images/fendi-roma-white-S-front-transparent-v2.webp` (30788 bytes)
- `images/gucci-pumps-angle.webp` (196700 bytes)
- `images/gucci-pumps-detail.webp` (123408 bytes)
- `images/gucci-pumps-sole.webp` (173898 bytes)
- `images/gucci-pumps-top.webp` (129188 bytes)
- `images/gucci-socks-cutout.webp` (68240 bytes)
- `images/hermes-bouncing-mesh-beige-back.webp` (52474 bytes)
- `images/hermes-bouncing-mesh-beige-cover.webp` (52142 bytes)
- `images/hermes-bouncing-mesh-beige-side.webp` (52952 bytes)
- `images/hermes-bride-a-brac-small-official.webp` (37190 bytes)
- `images/hermes-chypre-beige-nude-cover.webp` (33494 bytes)
- `images/hermes-chypre-beige-nude-side.webp` (23112 bytes)
- `images/hermes-chypre-beige-nude-top.webp` (59366 bytes)
- `images/margiela-mary-jane-back.webp` (43646 bytes)
- `images/margiela-mary-jane-cover.webp` (50496 bytes)
- `images/margiela-mary-jane-side.webp` (33744 bytes)
- `images/margiela-mary-jane-top.webp` (74610 bytes)
- `images/messika-13507-wg-actual.webp` (235042 bytes)
- `images/messika-13507-wg-detail.webp` (78946 bytes)
- `images/messika-baby-move-4325-angle.webp` (42698 bytes)
- `images/messika-baby-move-4325-cover-v2.webp` (44602 bytes)
- `images/messika-baby-move-4325-cover.webp` (40640 bytes)
- `images/products/hermes-sneakers-38-cutout.webp` (199182 bytes)
- `images/rimowa-case-blue.webp` (44740 bytes)
- `images/rimowa-case-olive.webp` (63188 bytes)
- `images/rimowa-case-silver.webp` (64886 bytes)
- `images/rimowa-official-blue.webp` (19298 bytes)
- `images/rimowa-official-silver.webp` (19822 bytes)
- `images/rimowa-official-titanium.webp` (20260 bytes)
- `fonts/playfair-display-600.woff` (60492 bytes)
- `fonts/roboto-500.woff` (74604 bytes)
- `fonts/dm-sans-500.woff` (26572 bytes)
- `fonts/playfair-display-500.woff` (59784 bytes)
- `fonts/dm-sans-400.woff` (26204 bytes)
- `fonts/roboto-300.woff` (73368 bytes)
- `fonts/roboto-400.woff` (72968 bytes)
- `fonts/dm-sans-600.woff` (26120 bytes)
