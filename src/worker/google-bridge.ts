import { z } from "zod";

const catalogueResponseSchema = z.object({
  ok: z.literal(true),
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  rows: z.array(z.tuple([z.string(), z.string()])).max(1000),
});

export interface GoogleBridgeConfig {
  url: string;
  requestSecret: string;
}

export interface CatalogueSnapshot {
  generatedAt: string;
  rows: [string, string][];
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function readGoogleBridgeConfig(env: {
  GOOGLE_BRIDGE_URL?: string;
  GOOGLE_BRIDGE_REQUEST_SECRET?: string;
}): GoogleBridgeConfig {
  if (!env.GOOGLE_BRIDGE_URL || !env.GOOGLE_BRIDGE_REQUEST_SECRET) {
    throw new Error("The Google Sheet bridge is not configured");
  }
  const url = new URL(env.GOOGLE_BRIDGE_URL);
  if (
    url.protocol !== "https:"
    || url.hostname !== "script.google.com"
    || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
    || url.search
    || url.hash
  ) {
    throw new Error("GOOGLE_BRIDGE_URL must be a Google Apps Script web-app URL");
  }
  if (env.GOOGLE_BRIDGE_REQUEST_SECRET.length < 32) {
    throw new Error("GOOGLE_BRIDGE_REQUEST_SECRET must be at least 32 characters");
  }
  return { url: url.toString(), requestSecret: env.GOOGLE_BRIDGE_REQUEST_SECRET };
}

export async function signBridgeRequest(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

export async function requestCatalogueSnapshot(
  config: GoogleBridgeConfig,
  fetcher: typeof fetch = fetch,
): Promise<CatalogueSnapshot> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const message = `catalogue\n${timestamp}\n${nonce}`;
  const signature = await signBridgeRequest(message, config.requestSecret);
  const response = await fetcher(config.url, {
    method: "POST",
    redirect: "follow",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ action: "catalogue", timestamp, nonce, signature }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google Sheet bridge returned HTTP ${response.status}`);
  if (response.url) {
    const responseUrl = new URL(response.url);
    if (!["script.google.com", "script.googleusercontent.com"].includes(responseUrl.hostname)) {
      throw new Error("Google Sheet bridge redirected to an unexpected host");
    }
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Google Sheet bridge did not return JSON");
  }
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > 1_000_000) throw new Error("Google Sheet bridge response was too large");
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("Google Sheet bridge response was too large");
  const raw = JSON.parse(text) as { ok?: boolean; error?: string };
  if (raw.ok === false) throw new Error(raw.error || "Google Sheet bridge rejected the request");
  const parsed = catalogueResponseSchema.parse(raw);
  return { generatedAt: parsed.generatedAt, rows: parsed.rows };
}
