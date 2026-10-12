# Isolated administration deployment

Vercel project juliproz-admin uses apps/admin as its root, sourceFilesOutsideRootDirectory enabled, and Node 24.x. It copies only administration assets; Telegram configuration and public API handlers are excluded.

Production: https://admin.juliproz.com/admin.html
Supabase Auth Site URL and the sole exact Redirect URL use this address. Invitations accept only this origin and recovery explicitly requests this callback. The owner confirmed login on the new origin before cutover.

Public builds replace admin.html with a transition page and exclude admin scripts. The transition removes legacy browser credentials and strips query strings/fragments before navigating. Public app startup also removes the old admin session key; unrelated preferences, cart and wishlist remain intact. Existing new-origin sessions are unaffected.

Verification: automated synthetic invitation/recovery and transition tests; live origin/headers/asset checks. No real invitation or password-reset email is sent automatically. Owner MFA and leaked-password protection are tracked separately.
