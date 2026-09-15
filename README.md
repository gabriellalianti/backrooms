# Backrooms

Backrooms is a lightweight staff dashboard for CREATE UNSW sales. It puts the Sheet-backed parts catalogue, locker locations, pickup orders, order comments, and collection audit trail in one place.

The repository defaults to sanitized local fixtures. A privately configured Apps Script bridge can import the real Sheet catalogue into local D1, and the local Worker can refresh current storefront prices and images. Gmail import and live production deployment remain disconnected.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run db:setup
npm run dev
```

Open <http://127.0.0.1:5173>. The fixture identity is `director@backrooms.local`, which has the admin role.

Local D1 data persists in `.wrangler/`. Running `npm run db:seed:local` resets the known fixture records but does not delete unrelated local records.

Useful commands:

```bash
npm test
npm run typecheck
npm run build
npm run db:migrate:local
npm run db:seed:local
```

Production deploys deliberately require an ignored `wrangler.production.jsonc` file, so the fixture identity can never be deployed by the normal deploy command. Copy `wrangler.production.jsonc.example`, fill it locally, and follow the production configuration section before deploying.

The exact Cloudflare and Google steps are in [docs/production-setup.md](docs/production-setup.md). This design does not require Cloudflare Zero Trust or a payment card.

To test the real Sheet and storefront locally before deploying, follow [docs/local-integrations.md](docs/local-integrations.md).

## Architecture

```text
src/react-app/      React SPA served as static Worker assets
src/worker/         Hono API and Google OAuth session handling running in Cloudflare Workers
src/shared/         Shared types and pure parsing/matching logic
migrations/         D1 schema migrations
fixtures/           Sanitized local-only seed data
tests/              Parser and catalogue contract tests
apps-script/        Production Google bridge contract (not connected)
```

The React application and API deploy together. Static navigation is handled by the SPA; `/api/*` requests are handled by the Worker. D1 holds operational data, revocable login sessions, and cached storefront metadata. Storefront image URLs are cached directly; an optional R2 binding can be introduced later if binary image caching becomes necessary.

## Implemented fixture slice

- Responsive catalogue search with compact cards, locker/A–Z sorting, locations, current/last-known prices, derived storefront links, and placeholders.
- Pickup orders with quantities, line totals, matched catalogue products, display-only customer comments, and components automatically arranged in locker-picking order.
- Pending/collected filtering, staff collection/reopen actions, optimistic concurrency, and audit events.
- Viewer, staff, and admin roles with an admin-managed email allowlist.
- Direct Google OpenID Connect for production with PKCE, state and nonce validation, D1-backed revocable sessions, and a clearly identified fixture mode locally.
- Admin-triggered real Sheet snapshot import through a narrowly scoped, HMAC-authenticated Apps Script bridge.
- Batched storefront refresh with fixed-host validation, product-title matching, current/last-known metadata states, and cached image URLs.
- Strict email parsing for supplied OpenCart formats, including HTML entities, non-breaking spaces, repeated model suffixes, optional comments, and malformed-message rejection.
- Sheet row parsing that reads only A and B, skips blank names, represents blank locations as `N/A`, and rejects duplicate normalized names.

## Sheet contract

The Google bridge will identify the target tab by its numeric `gid` and read only `A2:B` through the final used row.

Storefront links are derived from column A by lowercasing the product name and collapsing punctuation or symbols into single dashes. A confirmed URL stored during a successful catalogue refresh takes precedence over the derived fallback.

| Column | Meaning |
| --- | --- |
| A | Canonical product name |
| B | Locker location; blank displays as `N/A` |
| C onward | Ignored by Backrooms |

Cell notes, comments, formulas, and formatting are not imported. Merged cells spanning A or B are unsupported. Duplicate product names after whitespace/case normalization fail the entire snapshot so the previous good catalogue remains available.

## Production configuration (later phase)

Do not place real values in `wrangler.jsonc`, migrations, fixtures, or tracked environment files.

Cloudflare Worker secrets/configuration will include:

```text
APP_MODE=production
APP_ORIGIN
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
SESSION_SECRET
GOOGLE_BRIDGE_URL
GOOGLE_BRIDGE_REQUEST_SECRET
GOOGLE_BRIDGE_PUSH_SECRET
```

`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and bridge secrets must be uploaded with `wrangler secret put`; they must never be written into either Wrangler configuration file. `SESSION_SECRET` must contain at least 32 random characters. `GOOGLE_BRIDGE_PUSH_SECRET` and `BACKROOMS_IMPORT_URL` are reserved for the future scheduled Gmail push and are not used by the catalogue-only bridge.

Apps Script Properties will include:

```text
SPREADSHEET_ID
SHEET_GID
BACKROOMS_IMPORT_URL
GOOGLE_BRIDGE_REQUEST_SECRET
GOOGLE_BRIDGE_PUSH_SECRET
```

The production `database_id` must replace the local placeholder in private deployment configuration. The first real administrator will be inserted using a one-off remote D1 command rather than a committed migration.

See [apps-script/README.md](apps-script/README.md) for the implemented Sheet boundary and the separately planned Gmail integration.

## Security model

- Google OpenID Connect authenticates identities; D1 determines whether an email is active and what it may do.
- The Worker uses the Authorization Code flow with PKCE, state and nonce validation, then verifies Google's token signature, issuer, audience, expiry, nonce, and verified-email claim.
- Google access and ID tokens are discarded after login. D1 stores only an opaque session's SHA-256 hash, the Google subject identifier, its allowlisted email, and expiry.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, host-only, and expire after seven days. Logout and user deactivation revoke access server-side.
- Every API route performs authorization server-side. Hiding UI controls is not treated as authorization.
- Browser mutations enforce same-origin requests.
- Gmail bodies will not be stored. The bridge will send only order fields and the product/comment sections needed by the parser.
- Storefront fetches will be restricted to an explicit CREATE store hostname; validated image URLs and product metadata will be cached in D1.
- `.dev.vars*`, `.env*`, `.clasp.json`, local database state, and `local-fixtures/` are ignored.

## Remaining production work

- Apps Script Gmail adapter with signed, replay-resistant messages.
- Transactional order upsert endpoints.
- Admin resolution UI for ambiguous/unmatched order items.
- Cloudflare provisioning and live Google OAuth round-trip verification using the documented setup runbook.
- End-to-end tests using mocked Google identity responses and production-shaped sync payloads.

## License

[MIT](LICENSE)
