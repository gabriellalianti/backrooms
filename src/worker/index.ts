import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z, ZodError } from "zod";
import type { CollectionState, Order, OrderEvent, OrderItem, Product, Role, User } from "../shared/types";
import { CatalogueParseError, parseSheetRows } from "../shared/catalogue-parser";
import { deriveStorefrontPageUrl } from "../shared/storefront";
import {
  buildGoogleAuthorizationUrl,
  constantTimeEqual,
  createOAuthChallenge,
  createSessionToken,
  exchangeGoogleCode,
  hashSessionToken,
  readGoogleAuthConfig,
  readOAuthChallenge,
  verifyGoogleIdentity,
} from "./auth";
import { readGoogleBridgeConfig, requestCatalogueSnapshot } from "./google-bridge";
import { fetchStorefrontMetadata } from "./storefront-fetch";

interface Env {
  DB: D1Database;
  PRODUCT_IMAGES?: R2Bucket;
  APP_MODE: "fixture" | "production";
  FIXTURE_USER_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  APP_ORIGIN?: string;
  GOOGLE_BRIDGE_URL?: string;
  GOOGLE_BRIDGE_REQUEST_SECRET?: string;
}

type Variables = { user: User };
type AppContext = { Bindings: Env; Variables: Variables };

interface ProductRow {
  id: string;
  name: string;
  location: string | null;
  page_url: string | null;
  price_cents: number | null;
  image_key: string | null;
  image_url: string | null;
  metadata_state: Product["metadataState"];
  metadata_refreshed_at: string | null;
}

interface OrderRow {
  id: string;
  date_added: string;
  source_status: string;
  comments: string | null;
  collection_state: CollectionState;
  collected_by: string | null;
  collected_at: string | null;
  version: number;
}

interface ItemRow {
  id: string;
  order_id: string;
  raw_name: string;
  quantity: number;
  line_total_cents: number;
  match_status: OrderItem["matchStatus"];
  product_id: string | null;
  product_name: string | null;
  product_location: string | null;
  product_page_url: string | null;
  product_price_cents: number | null;
  product_image_key: string | null;
  product_image_url: string | null;
  product_metadata_state: Product["metadataState"] | null;
  product_metadata_refreshed_at: string | null;
}

interface EventRow {
  id: string;
  order_id: string;
  action: CollectionState;
  actor_email: string;
  created_at: string;
  note: string | null;
}

interface CatalogueDatabaseRow {
  id: string;
  name: string;
  normalized_name: string;
  location: string | null;
  active: number;
}

interface StorefrontDatabaseRow {
  id: string;
  name: string;
  normalized_name: string;
  page_url: string | null;
  price_cents: number | null;
  image_url: string | null;
  metadata_state: Product["metadataState"];
}

const roleRank: Record<Role, number> = { viewer: 0, staff: 1, admin: 2 };
const sessionDurationSeconds = 60 * 60 * 24 * 7;
const app = new Hono<AppContext>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    pageUrl: row.page_url ?? deriveStorefrontPageUrl(row.name),
    priceCents: row.price_cents,
    imageUrl: row.image_url ?? (row.image_key ? `/api/images/${encodeURIComponent(row.image_key)}` : null),
    metadataState: row.metadata_state,
    metadataRefreshedAt: row.metadata_refreshed_at,
  };
}

async function loadUser(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT email, display_name, role, active FROM users WHERE email = ?")
    .bind(email)
    .first<{ email: string; display_name: string; role: Role; active: number }>();
  return row
    ? { email: row.email, displayName: row.display_name, role: row.role, active: row.active === 1 }
    : null;
}

function authCookieNames(env: Env) {
  const secure = env.APP_MODE === "production"
    ? readGoogleAuthConfig(env).appOrigin.startsWith("https://")
    : false;
  return {
    secure,
    session: secure ? "__Host-backrooms-session" : "backrooms_session",
    challenge: secure ? "__Host-backrooms-oauth" : "backrooms_oauth",
  };
}

async function authenticatedUser(context: Context<AppContext>): Promise<User | null> {
  if (context.env.APP_MODE === "fixture") {
    return loadUser(
      context.env.DB,
      (context.env.FIXTURE_USER_EMAIL ?? "director@backrooms.local").toLowerCase(),
    );
  }

  const cookies = authCookieNames(context.env);
  const sessionToken = getCookie(context, cookies.session);
  if (!sessionToken) return null;
  const tokenHash = await hashSessionToken(sessionToken);
  const row = await context.env.DB
    .prepare(
      `SELECT u.email, u.display_name, u.role, u.active
         FROM sessions s
         JOIN users u ON u.email = s.user_email
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{ email: string; display_name: string; role: Role; active: number }>();
  if (!row) {
    deleteCookie(context, cookies.session, { path: "/", secure: cookies.secure });
    return null;
  }
  return {
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active === 1,
  };
}

function requireRole(user: User, minimum: Role): void {
  if (roleRank[user.role] < roleRank[minimum]) {
    throw new Response("Forbidden", { status: 403 });
  }
}

function requireSameOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("Origin");
  const expectedOrigin = env.APP_MODE === "production"
    ? readGoogleAuthConfig(env).appOrigin
    : new URL(request.url).origin;
  if ((env.APP_MODE === "production" && !origin) || (origin && origin !== expectedOrigin)) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}

app.onError((error, context) => {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    return context.json({ error: "Invalid request data.", issues: error.issues }, 400);
  }
  console.error(error instanceof Error ? error.message : "Unknown error");
  return context.json({ error: "The request could not be completed." }, 500);
});

function authErrorRedirect(appOrigin: string, reason: string): string {
  const url = new URL(appOrigin);
  url.searchParams.set("auth_error", reason);
  return url.toString();
}

app.get("/auth/google", async (context) => {
  if (context.env.APP_MODE === "fixture") return context.redirect("/");
  const config = readGoogleAuthConfig(context.env);
  const cookies = authCookieNames(context.env);
  const { challenge, cookieValue, codeChallenge } = await createOAuthChallenge(config.sessionSecret);
  setCookie(context, cookies.challenge, cookieValue, {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });
  context.header("Cache-Control", "no-store");
  return context.redirect(buildGoogleAuthorizationUrl(config, challenge, codeChallenge).toString());
});

app.get("/auth/google/callback", async (context) => {
  if (context.env.APP_MODE === "fixture") return context.redirect("/");
  const config = readGoogleAuthConfig(context.env);
  const cookies = authCookieNames(context.env);
  const challengeCookie = getCookie(context, cookies.challenge);
  deleteCookie(context, cookies.challenge, { path: "/", secure: cookies.secure });
  context.header("Cache-Control", "no-store");

  if (context.req.query("error")) {
    return context.redirect(authErrorRedirect(config.appOrigin, "cancelled"));
  }

  const code = context.req.query("code");
  const returnedState = context.req.query("state");
  if (!code || !returnedState || !challengeCookie) {
    return context.redirect(authErrorRedirect(config.appOrigin, "invalid_callback"));
  }

  try {
    const challenge = await readOAuthChallenge(challengeCookie, config.sessionSecret);
    if (!constantTimeEqual(returnedState, challenge.state)) {
      return context.redirect(authErrorRedirect(config.appOrigin, "invalid_callback"));
    }
    const idToken = await exchangeGoogleCode(code, challenge.codeVerifier, config);
    const identity = await verifyGoogleIdentity(idToken, config.clientId, challenge.nonce);
    const user = await loadUser(context.env.DB, identity.email);
    if (!user?.active) {
      return context.redirect(authErrorRedirect(config.appOrigin, "not_whitelisted"));
    }

    const sessionToken = createSessionToken();
    const tokenHash = await hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000).toISOString();
    await context.env.DB.batch([
      context.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()),
      context.env.DB
        .prepare(
          `INSERT INTO sessions (token_hash, user_email, google_subject, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(tokenHash, user.email, identity.subject, expiresAt),
      context.env.DB
        .prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE email = ?")
        .bind(user.email),
    ]);
    setCookie(context, cookies.session, sessionToken, {
      httpOnly: true,
      secure: cookies.secure,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionDurationSeconds,
    });
    return context.redirect(config.appOrigin);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Google authentication failed");
    return context.redirect(authErrorRedirect(config.appOrigin, "failed"));
  }
});

app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  if (context.req.method !== "GET" && context.req.method !== "HEAD") {
    requireSameOrigin(context.req.raw, context.env);
  }
  const user = await authenticatedUser(context);
  if (!user) return context.json({ error: "Authentication required." }, 401);
  context.set("user", user);
  await next();
});

app.get("/api/session", async (context) => {
  const user = context.get("user");
  return context.json({ user, fixtureMode: context.env.APP_MODE === "fixture" });
});

app.post("/api/logout", async (context) => {
  if (context.env.APP_MODE === "production") {
    const cookies = authCookieNames(context.env);
    const sessionToken = getCookie(context, cookies.session);
    if (sessionToken) {
      await context.env.DB
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await hashSessionToken(sessionToken))
        .run();
    }
    deleteCookie(context, cookies.session, { path: "/", secure: cookies.secure });
  }
  return context.json({ ok: true });
});

app.get("/api/catalogue", async (context) => {
  const rows = await context.env.DB
    .prepare(
      `SELECT id, name, location, page_url, price_cents, image_key, image_url, metadata_state,
              metadata_refreshed_at
         FROM products
        WHERE active = 1
        ORDER BY normalized_name`,
    )
    .all<ProductRow>();
  return context.json({ products: rows.results.map(productFromRow) });
});

app.get("/api/orders", async (context) => {
  const [ordersResult, itemsResult, eventsResult] = await context.env.DB.batch([
    context.env.DB.prepare(
      `SELECT id, date_added, source_status, comments, collection_state, collected_by,
              collected_at, version
         FROM orders
        ORDER BY CASE collection_state WHEN 'pending' THEN 0 ELSE 1 END, date_added DESC`,
    ),
    context.env.DB.prepare(
      `SELECT oi.id, oi.order_id, oi.raw_name, oi.quantity, oi.line_total_cents,
              oi.match_status, p.id AS product_id, p.name AS product_name,
              p.location AS product_location, p.page_url AS product_page_url,
              p.price_cents AS product_price_cents, p.image_key AS product_image_key,
              p.image_url AS product_image_url,
              p.metadata_state AS product_metadata_state,
              p.metadata_refreshed_at AS product_metadata_refreshed_at
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
        ORDER BY oi.order_id, oi.sort_order`,
    ),
    context.env.DB.prepare(
      `SELECT id, order_id, action, actor_email, created_at, note
         FROM order_events
        ORDER BY created_at DESC`,
    ),
  ]);

  const itemRows = itemsResult.results as unknown as ItemRow[];
  const eventRows = eventsResult.results as unknown as EventRow[];
  const orders: Order[] = (ordersResult.results as unknown as OrderRow[]).map((row) => ({
    id: row.id,
    dateAdded: row.date_added,
    sourceStatus: row.source_status,
    comments: row.comments,
    collectionState: row.collection_state,
    collectedBy: row.collected_by,
    collectedAt: row.collected_at,
    version: row.version,
    items: itemRows
      .filter((item) => item.order_id === row.id)
      .map((item) => ({
        id: item.id,
        rawName: item.raw_name,
        quantity: item.quantity,
        lineTotalCents: item.line_total_cents,
        matchStatus: item.match_status,
        product: item.product_id
          ? productFromRow({
              id: item.product_id,
              name: item.product_name!,
              location: item.product_location,
              page_url: item.product_page_url,
              price_cents: item.product_price_cents,
              image_key: item.product_image_key,
              image_url: item.product_image_url,
              metadata_state: item.product_metadata_state ?? "unavailable",
              metadata_refreshed_at: item.product_metadata_refreshed_at,
            })
          : null,
      })),
    events: eventRows
      .filter((event) => event.order_id === row.id)
      .map<OrderEvent>((event) => ({
        id: event.id,
        action: event.action,
        actorEmail: event.actor_email,
        createdAt: event.created_at,
        note: event.note,
      })),
  }));

  return context.json({ orders });
});

const transitionSchema = z.object({ version: z.number().int().positive(), note: z.string().trim().max(500).optional() });

async function transitionOrder(
  context: Context<AppContext>,
  target: CollectionState,
) {
  const user = context.get("user") as User;
  requireRole(user, "staff");
  const input = transitionSchema.parse(await context.req.json());
  const orderId = context.req.param("id");
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const nextVersion = input.version + 1;
  const collected = target === "collected";

  const [update] = await context.env.DB.batch([
    context.env.DB
      .prepare(
        `UPDATE orders
            SET collection_state = ?,
                collected_by = ?,
                collected_at = ?,
                version = version + 1,
                updated_at = ?
          WHERE id = ? AND version = ? AND collection_state <> ?`,
      )
      .bind(target, collected ? user.email : null, collected ? now : null, now, orderId, input.version, target),
    context.env.DB
      .prepare(
        `INSERT INTO order_events (id, order_id, action, actor_email, note, created_at)
         SELECT ?, id, ?, ?, ?, ? FROM orders
          WHERE id = ? AND version = ? AND collection_state = ?`,
      )
      .bind(eventId, target, user.email, input.note ?? null, now, orderId, nextVersion, target),
  ]);

  if (!update.meta.changes) {
    return context.json({ error: "Order changed elsewhere. Refresh and try again." }, 409);
  }
  return context.json({ ok: true, version: nextVersion });
}

app.post("/api/orders/:id/collect", (context) => transitionOrder(context, "collected"));
app.post("/api/orders/:id/reopen", (context) => transitionOrder(context, "pending"));

app.get("/api/images/:key", async (context) => {
  const object = await context.env.PRODUCT_IMAGES?.get(context.req.param("key"));
  if (!object) return context.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=86400");
  return new Response(object.body, { headers });
});

app.get("/api/admin/users", async (context) => {
  requireRole(context.get("user"), "admin");
  const rows = await context.env.DB
    .prepare("SELECT email, display_name, role, active FROM users ORDER BY display_name, email")
    .all<{ email: string; display_name: string; role: Role; active: number }>();
  return context.json({
    users: rows.results.map((row) => ({
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      active: row.active === 1,
    } satisfies User)),
  });
});

const userSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(["viewer", "staff", "admin"]),
});

app.post("/api/admin/users", async (context) => {
  requireRole(context.get("user"), "admin");
  const input = userSchema.parse(await context.req.json());
  await context.env.DB
    .prepare(
      `INSERT INTO users (email, display_name, role, active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         role = excluded.role,
         active = 1,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(input.email, input.displayName, input.role)
    .run();
  return context.json({ ok: true }, 201);
});

const updateUserSchema = z.object({
  role: z.enum(["viewer", "staff", "admin"]),
  active: z.boolean(),
});

app.patch("/api/admin/users/:email", async (context) => {
  const actor = context.get("user");
  requireRole(actor, "admin");
  const targetEmail = decodeURIComponent(context.req.param("email")).toLowerCase();
  const input = updateUserSchema.parse(await context.req.json());
  if (targetEmail === actor.email && (!input.active || input.role !== "admin")) {
    return context.json({ error: "You cannot remove your own administrator access." }, 400);
  }
  const result = await context.env.DB
    .prepare("UPDATE users SET role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(input.role, input.active ? 1 : 0, targetEmail)
    .run();
  if (!result.meta.changes) return context.notFound();
  return context.json({ ok: true });
});

function isCatalogueBridgeConfigured(env: Env): boolean {
  try {
    readGoogleBridgeConfig(env);
    return true;
  } catch {
    return false;
  }
}

async function recordFailedSync(
  db: D1Database,
  id: string,
  kind: "catalogue" | "metadata",
  startedAt: string,
  error: unknown,
) {
  await db
    .prepare(
      `INSERT INTO sync_runs
         (id, kind, status, started_at, finished_at, records_seen, records_changed, error_summary)
       VALUES (?, ?, 'failed', ?, ?, 0, 0, ?)`,
    )
    .bind(id, kind, startedAt, new Date().toISOString(), errorMessage(error).slice(0, 500))
    .run();
}

app.post("/api/admin/sync/catalogue", async (context) => {
  requireRole(context.get("user"), "admin");
  let config;
  try {
    config = readGoogleBridgeConfig(context.env);
  } catch {
    return context.json({ error: "Configure the Google Sheet bridge in .dev.vars first." }, 400);
  }

  const syncId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  try {
    const snapshot = await requestCatalogueSnapshot(config);
    const products = parseSheetRows(snapshot.rows);
    if (!products.length) throw new CatalogueParseError("The Sheet contained no products in column A.", []);

    const existingResult = await context.env.DB
      .prepare("SELECT id, name, normalized_name, location, active FROM products")
      .all<CatalogueDatabaseRow>();
    const existingByName = new Map(existingResult.results.map((row) => [row.normalized_name, row]));
    const incomingNames = new Set(products.map((product) => product.normalizedName));
    const changed = products.filter((product) => {
      const existing = existingByName.get(product.normalizedName);
      return !existing
        || existing.active !== 1
        || existing.name !== product.name
        || existing.location !== product.location;
    }).length + existingResult.results.filter(
      (row) => row.active === 1 && !incomingNames.has(row.normalized_name),
    ).length;
    const finishedAt = new Date().toISOString();

    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare(
        `INSERT INTO sync_runs (id, kind, status, started_at, records_seen, records_changed)
         VALUES (?, 'catalogue', 'running', ?, ?, 0)`,
      ).bind(syncId, startedAt, products.length),
      context.env.DB.prepare("UPDATE products SET active = 0, updated_at = ? WHERE active = 1").bind(finishedAt),
    ];
    for (const product of products) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO products
             (id, name, normalized_name, location, source_row, active, metadata_state,
              sheet_synced_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'unavailable', ?, ?, ?)
           ON CONFLICT(normalized_name) DO UPDATE SET
             name = excluded.name,
             location = excluded.location,
             source_row = excluded.source_row,
             active = 1,
             sheet_synced_at = excluded.sheet_synced_at,
             updated_at = excluded.updated_at`,
        ).bind(
          crypto.randomUUID(),
          product.name,
          product.normalizedName,
          product.location,
          product.sourceRow,
          finishedAt,
          finishedAt,
          finishedAt,
        ),
      );
    }
    statements.push(
      context.env.DB.prepare(
        `UPDATE sync_runs
            SET status = 'succeeded', finished_at = ?, records_changed = ?
          WHERE id = ?`,
      ).bind(finishedAt, changed, syncId),
    );
    await context.env.DB.batch(statements);
    return context.json({
      ok: true,
      recordsSeen: products.length,
      recordsChanged: changed,
      sourceGeneratedAt: snapshot.generatedAt,
    });
  } catch (error) {
    await recordFailedSync(context.env.DB, syncId, "catalogue", startedAt, error);
    if (error instanceof CatalogueParseError) {
      return context.json({ error: error.message, rows: error.rows }, 422);
    }
    console.error(`Catalogue sync failed: ${errorMessage(error)}`);
    return context.json({ error: "The Sheet catalogue could not be imported. Check the bridge configuration and try again." }, 502);
  }
});

const storefrontRefreshSchema = z.object({
  after: z.string().max(300).optional().default(""),
  limit: z.number().int().min(1).max(10).optional().default(8),
});

app.post("/api/admin/sync/storefront", async (context) => {
  requireRole(context.get("user"), "admin");
  const input = storefrontRefreshSchema.parse(await context.req.json().catch(() => ({})));
  const syncId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  try {
    const queryResult = await context.env.DB
      .prepare(
        `SELECT id, name, normalized_name, page_url, price_cents, image_url, metadata_state
           FROM products
          WHERE active = 1 AND normalized_name > ?
          ORDER BY normalized_name
          LIMIT ?`,
      )
      .bind(input.after, input.limit + 1)
      .all<StorefrontDatabaseRow>();
    const done = queryResult.results.length <= input.limit;
    const products = queryResult.results.slice(0, input.limit);
    const refreshedAt = new Date().toISOString();
    // The volunteer-run storefront intermittently stalls under larger bursts.
    // Two concurrent reads keep a manual refresh quick without overwhelming it.
    const outcomes = await mapWithConcurrency(products, 2, async (product) => {
      try {
        const metadata = await fetchStorefrontMetadata(product.name, product.page_url);
        return { product, metadata, error: null };
      } catch (error) {
        return { product, metadata: null, error: errorMessage(error) };
      }
    });

    let changed = 0;
    const failures: Array<{ name: string; reason: string }> = [];
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare(
        `INSERT INTO sync_runs (id, kind, status, started_at, records_seen, records_changed)
         VALUES (?, 'metadata', 'running', ?, ?, 0)`,
      ).bind(syncId, startedAt, products.length),
    ];
    for (const outcome of outcomes) {
      const { product, metadata } = outcome;
      if (metadata) {
        if (
          product.page_url !== metadata.pageUrl
          || product.price_cents !== metadata.priceCents
          || product.image_url !== metadata.imageUrl
          || product.metadata_state !== "current"
        ) changed += 1;
        statements.push(
          context.env.DB.prepare(
            `UPDATE products
                SET page_url = ?, price_cents = ?, image_url = ?, metadata_state = 'current',
                    metadata_refreshed_at = ?, updated_at = ?
              WHERE id = ?`,
          ).bind(
            metadata.pageUrl,
            metadata.priceCents,
            metadata.imageUrl,
            refreshedAt,
            refreshedAt,
            product.id,
          ),
        );
      } else {
        const nextState = product.price_cents !== null || product.image_url !== null ? "last_known" : "unavailable";
        if (product.metadata_state !== nextState) changed += 1;
        failures.push({ name: product.name, reason: outcome.error ?? "Listing unavailable" });
        statements.push(
          context.env.DB.prepare(
            `UPDATE products
                SET metadata_state = ?, metadata_refreshed_at = ?, updated_at = ?
              WHERE id = ?`,
          ).bind(nextState, refreshedAt, refreshedAt, product.id),
        );
      }
    }
    statements.push(
      context.env.DB.prepare(
        `UPDATE sync_runs
            SET status = 'succeeded', finished_at = ?, records_changed = ?
          WHERE id = ?`,
      ).bind(refreshedAt, changed, syncId),
    );
    await context.env.DB.batch(statements);
    return context.json({
      ok: true,
      recordsSeen: products.length,
      recordsChanged: changed,
      refreshed: outcomes.length - failures.length,
      unavailable: failures.length,
      failures,
      nextCursor: products.at(-1)?.normalized_name ?? null,
      done,
    });
  } catch (error) {
    await recordFailedSync(context.env.DB, syncId, "metadata", startedAt, error);
    console.error(`Storefront refresh failed: ${errorMessage(error)}`);
    return context.json({ error: "The storefront catalogue could not be refreshed." }, 502);
  }
});

app.get("/api/admin/sync-status", async (context) => {
  requireRole(context.get("user"), "admin");
  const rows = await context.env.DB
    .prepare(
      `SELECT kind, status, started_at, finished_at, records_seen, records_changed, error_summary
         FROM sync_runs
        WHERE id IN (SELECT id FROM sync_runs s2 WHERE s2.kind = sync_runs.kind ORDER BY started_at DESC LIMIT 1)
        ORDER BY kind`,
    )
    .all();
  return context.json({
    runs: rows.results,
    fixtureMode: context.env.APP_MODE === "fixture",
    integrations: {
      catalogueBridgeConfigured: isCatalogueBridgeConfigured(context.env),
      storefrontRefreshAvailable: true,
    },
  });
});

export default app;
