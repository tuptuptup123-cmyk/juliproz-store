# Isolated administration deployment

Deploy this directory as a separate Vercel project with sourceFilesOutsideRootDirectory enabled and Node 24.x. The build copies only administration assets from the same repository; no API functions, storefront app or Telegram configuration run here. Custom domain: admin.juliproz.com.

This is the preparation phase. The existing admin remains available until Supabase Auth redirect URLs, invitation delivery, recovery and an actual owner login have been verified on the new origin. Do not redirect legacy admin pages before that verification. Browser sessions are origin-scoped and are never transferred between origins.

Before the switch: add https://admin.juliproz.com/admin.html to Auth redirects, change the Auth site URL and invitation redirect, allow the new origin in invite-store-admin, verify recovery and owner MFA, then replace the public admin with a transition page that clears its old stored session and links to the new origin without forwarding query strings or fragments.
