import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const oauthChallengeAudience = "backrooms-google-oauth";
const oauthChallengeIssuer = "backrooms";

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  appOrigin: string;
}

export interface OAuthChallenge {
  state: string;
  nonce: string;
  codeVerifier: string;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
}

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return uint8ArrayToBase64Url(bytes);
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function secretKey(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export function readGoogleAuthConfig(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  APP_ORIGIN?: string;
}): GoogleAuthConfig {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET || !env.APP_ORIGIN) {
    throw new Error("Google authentication is not configured");
  }
  const appUrl = new URL(env.APP_ORIGIN);
  const appOrigin = appUrl.origin;
  if (appOrigin !== env.APP_ORIGIN.replace(/\/$/, "")) {
    throw new Error("APP_ORIGIN must contain only an origin, without a path");
  }
  const isLocalDevelopment = appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1";
  if (appUrl.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("APP_ORIGIN must use HTTPS outside local development");
  }
  secretKey(env.SESSION_SECRET);
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    appOrigin,
  };
}

export async function createOAuthChallenge(sessionSecret: string): Promise<{
  challenge: OAuthChallenge;
  cookieValue: string;
  codeChallenge: string;
}> {
  const challenge = {
    state: randomBase64Url(24),
    nonce: randomBase64Url(24),
    codeVerifier: randomBase64Url(48),
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(challenge.codeVerifier));
  const codeChallenge = uint8ArrayToBase64Url(new Uint8Array(digest));
  const cookieValue = await new SignJWT(challenge)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(oauthChallengeIssuer)
    .setAudience(oauthChallengeAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey(sessionSecret));
  return { challenge, cookieValue, codeChallenge };
}

export async function readOAuthChallenge(cookieValue: string, sessionSecret: string): Promise<OAuthChallenge> {
  const { payload } = await jwtVerify(cookieValue, secretKey(sessionSecret), {
    issuer: oauthChallengeIssuer,
    audience: oauthChallengeAudience,
  });
  if (
    typeof payload.state !== "string"
    || typeof payload.nonce !== "string"
    || typeof payload.codeVerifier !== "string"
  ) {
    throw new Error("Invalid OAuth challenge");
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    codeVerifier: payload.codeVerifier,
  };
}

export function buildGoogleAuthorizationUrl(
  config: Pick<GoogleAuthConfig, "clientId" | "appOrigin">,
  challenge: Pick<OAuthChallenge, "state" | "nonce">,
  codeChallenge: string,
): URL {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.appOrigin}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state: challenge.state,
    nonce: challenge.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let difference = aBytes.length ^ bBytes.length;
  const length = Math.max(aBytes.length, bBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  config: GoogleAuthConfig,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: `${config.appOrigin}/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const result = await response.json() as GoogleTokenResponse;
  if (!response.ok || !result.id_token) {
    throw new Error(`Google token exchange failed${result.error ? `: ${result.error}` : ""}`);
  }
  return result.id_token;
}

export async function verifyGoogleIdentity(
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<VerifiedGoogleIdentity> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (!constantTimeEqual(String(payload.nonce ?? ""), expectedNonce)) {
    throw new Error("Google identity nonce did not match");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("Google did not return a verified email identity");
  }
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}

export function createSessionToken(): string {
  return randomBase64Url(32);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return uint8ArrayToBase64Url(new Uint8Array(digest));
}
