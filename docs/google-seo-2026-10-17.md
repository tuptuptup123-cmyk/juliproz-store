# Google SEO — Russian and English, worldwide

Scope: Google, global Russian- and English-speaking customers. No Yandex integration or country-specific targeting.

## Implemented

- Server HTML for the home page, catalogue, services, resale and 12 curated brand pages. Brand pages read only the existing public catalogue; no stock or product descriptions are modified.
- Distinct language URLs using the existing `?lang=en` format. Russian pages use the clean URL. Both have self-referencing canonicals and reciprocal `ru`, `en`, `x-default` alternatives.
- English product titles/descriptions and visible server content reuse the reviewed translation dictionaries. No browser execution is required to read the core product information. Product model/reference gaps still require factual manager input.
- Unique page titles and descriptions; Organization, WebSite, CollectionPage, ItemList, BreadcrumbList and existing Product/Offer data where appropriate. No invented ratings, price-on-request amounts, addresses or manufacturer references.
- Crawlable catalogue/product/brand links, language links in server HTML and an expanded sitemap including both language versions.
- Client enhancement retains brand filters, language switching, product opening and reloads. A failed initial product fetch retains the server-rendered product content.
- Existing admin, financial calculations and Telegram UI are outside this change.

## Verification

205 unit tests pass, including canonical/language pairing, server translation, HTML/JSON injection handling, brand selection, 404 and upstream-error responses. Existing language browser suite passes desktop/mobile/short-screen/Telegram guards. New SEO browser suite verifies hydration, brand filtering, links, language switching, reload, product opening and no-JavaScript access at 390 and 1280 pixels. Deployment and live route verification are recorded in the pull request.

## Google Search Console setup

1. Use the owner's Google account to add or open the JULI.PROZ property.
2. Confirm ownership using an available supported method. Do not invent verification tokens. Domain verification may need DNS access; URL-prefix verification can use Google's provided HTML tag/file.
3. Submit `https://www.juliproz.com/sitemap.xml` and inspect the live home, English home, brand and product URLs.
4. Request indexing for representative pages, then monitor coverage, queries, clicks and countries. Search Console configuration is complete only after the service confirms ownership and sitemap submission.

This source change makes pages eligible and discoverable; it does not prove that Google has indexed them or promise rankings. Review the real Search Console data after launch before choosing further content priorities.
