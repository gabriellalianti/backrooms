import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  constantTimeEqual,
  createOAuthChallenge,
  createSessionToken,
  hashSessionToken,
  readGoogleAuthConfig,
  readOAuthChallenge,
} from "../src/worker/auth";

const sessionSecret = "test-session-secret-that-is-long-enough";

describe("Google OAuth helpers", () => {
  it("creates a signed, short-lived challenge with PKCE", async () => {
    const result = await createOAuthChallenge(sessionSecret);
    expect(result.challenge.state).not.toBe(result.challenge.nonce);
    expect(result.challenge.codeVerifier.length).toBeGreaterThan(40);
    expect(result.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    await expect(readOAuthChallenge(result.cookieValue, sessionSecret))
      .resolves.toEqual(result.challenge);

    const [header, payload, signature] = result.cookieValue.split(".");
    const replacement = signature.startsWith("a") ? "b" : "a";
    const tampered = `${header}.${payload}.${replacement}${signature.slice(1)}`;
    await expect(readOAuthChallenge(tampered, sessionSecret)).rejects.toThrow();
  });

  it("builds an authorization-code request with minimal identity scopes", () => {
    const url = buildGoogleAuthorizationUrl(
      { clientId: "client.apps.googleusercontent.com", appOrigin: "https://backrooms.example" },
      { state: "state-value", nonce: "nonce-value" },
      "pkce-challenge",
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://backrooms.example/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("requires complete configuration and an origin-only callback base", () => {
    expect(() => readGoogleAuthConfig({})).toThrow("not configured");
    expect(() => readGoogleAuthConfig({
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      SESSION_SECRET: sessionSecret,
      APP_ORIGIN: "https://backrooms.example/path",
    })).toThrow("without a path");
    expect(() => readGoogleAuthConfig({
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      SESSION_SECRET: sessionSecret,
      APP_ORIGIN: "http://backrooms.example",
    })).toThrow("must use HTTPS");
    expect(readGoogleAuthConfig({
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      SESSION_SECRET: sessionSecret,
      APP_ORIGIN: "http://127.0.0.1:5173",
    }).appOrigin).toBe("http://127.0.0.1:5173");
  });

  it("hashes random session tokens before persistence", async () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(await hashSessionToken(first)).not.toBe(first);
    expect(await hashSessionToken(first)).toBe(await hashSessionToken(first));
  });

  it("compares OAuth values without an early mismatch return", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
    expect(constantTimeEqual("short", "shorter")).toBe(false);
  });
});
