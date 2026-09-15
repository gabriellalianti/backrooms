# Production setup

Backrooms does not need Cloudflare Zero Trust or any paid Cloudflare feature. Authentication is handled directly by Google OpenID Connect, while the app's D1 allowlist controls access and roles. It is intended to stay on the Workers Free and D1 Free plans; do not add a card or upgrade an account just for this app.

Complete these steps only when you are ready to put a production instance online. Until then, local fixture mode remains fully usable.

## 1. Create the Cloudflare resources

Sign in to the Cloudflare account that will own the app. The free `workers.dev` address is enough.

Authenticate Wrangler and create the D1 database:

```bash
npx wrangler login
npx wrangler d1 create backrooms
```

Copy `wrangler.production.jsonc.example` to `wrangler.production.jsonc`. That file is ignored by Git. Replace the placeholder `database_id` with the ID from the command above and replace `APP_ORIGIN` with the exact HTTPS origin Cloudflare assigns, without a trailing slash.

Do not put Google credentials or the session secret in this file.

## 2. Create the Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create or select a Google Cloud project owned by the appropriate account.
2. Configure the OAuth consent screen. Choose **External** so allowlisted personal Google accounts can sign in as well as society accounts.
3. Add only the basic `openid`, email, and profile scopes requested by Backrooms.
4. While the app is in testing mode, add every Backrooms user as an OAuth test user. Google limits and periodically expires test-mode authorizations, so move the consent screen to production when appropriate.
5. Create an OAuth client of type **Web application**.
6. Add this exact authorized redirect URI, replacing the hostname with the value in `APP_ORIGIN`:

```text
https://backrooms.your-account.workers.dev/auth/google/callback
```

Copy the generated client ID and client secret somewhere temporary and secure. They will be uploaded in the next step, not committed.

## 3. Upload Worker secrets

From the repository directory, run each command and paste the requested value at the hidden prompt:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.production.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.production.jsonc
npx wrangler secret put SESSION_SECRET --config wrangler.production.jsonc
```

Generate `SESSION_SECRET` with a password manager or a cryptographically secure random generator. Use at least 32 random characters. Changing it later immediately invalidates all existing login attempts, but active sessions remain valid until they expire or are deleted from D1.

## 4. Apply migrations and add the first administrator

Apply the schema:

```bash
npm run db:migrate:production
```

Use the D1 console in the Cloudflare dashboard to run this statement, substituting the first administrator's real Google email and display name:

```sql
INSERT INTO users (email, display_name, role, active)
VALUES ('admin@example.com', 'Initial administrator', 'admin', 1);
```

The email must match the address Google returns. After the first admin signs in, they can maintain the allowlist and roles from Backrooms. Do not add real addresses to fixtures or migrations.

## 5. Deploy and verify

```bash
npm run deploy
```

Open the production URL, choose **Sign in with Google**, and use the allowlisted administrator. Then verify:

- a non-allowlisted Google account receives the access-denied screen;
- the admin can add, deactivate, and assign roles to other users;
- signing out removes the session;
- the local fixture app still starts with `npm run dev`.

The production database will initially contain no catalogue or orders. The Sheet and storefront adapters can be configured after their local verification, but the Gmail order adapter is still a later phase. Do not use production for real packing work until all required imports are connected and verified.

## Security notes

- Use only an HTTPS production origin. The sole exception is local testing on `localhost` or `127.0.0.1`.
- The Worker never stores Google access tokens or ID tokens. It stores only a hash of Backrooms' own random session token.
- A Google login is necessary but not sufficient: the returned, verified email must also be active in the D1 allowlist.
- Keep Cloudflare and Google Cloud ownership recoverable by the society. Do not attach personal payment details or enable a paid plan for this setup.
