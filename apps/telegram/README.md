# Telegram storefront

This application owns its HTML, CSS, app controller, notice and privacy page.
Build: `node scripts/build-telegram.cjs` from the repository root.
Vercel root: `apps/telegram`; include source files outside the root.

The website remains at the repository root; admin remains in `apps/admin`.
The catalogue, stock, prices, taxonomy, image rules and shared utilities have
one source. There is no copied database and no new admin or credentials.

Public app origin: `https://app.juliproz.com/`.
Existing Telegram entries use `/telegram/` on their original store origin,
which proxies this independent deployment. The same-origin path deliberately
preserves browser carts, favourites, consent and launch fragments. Product IDs
and `t.me/JuliProzBot/shop?startapp=p_ID` links remain unchanged.

`/api/catalog` and `/api/analytics` use the existing backend. The bot webhook
stays at `https://juliproz-store.vercel.app/api/telegram`. This build never
configures the bot and does not need server secrets. Only Russian interface
copy ships here; website translations stay in the website application.

Changes to website HTML/CSS/app.js do not enter this build. Changes to shared
business modules must be checked against both storefronts. Separate Vercel
projects allow independent rollback. Do not add wildcard API proxy routes.

Before-split source snapshot: `backup/before-storefront-split-2026-10-14`,
commit `1cd29faa63af2e407b9b8698e7bb229bc82c5157`.
