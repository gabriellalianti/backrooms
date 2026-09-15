import { describe, expect, it, vi } from "vitest";
import {
  readGoogleBridgeConfig,
  requestCatalogueSnapshot,
  signBridgeRequest,
} from "../src/worker/google-bridge";

const requestSecret = "bridge-test-secret-that-is-at-least-32-characters";
const bridgeUrl = "https://script.google.com/macros/s/test-deployment/exec";

describe("Google Sheet bridge", () => {
  it("requires a fixed Apps Script URL and a sufficiently long secret", () => {
    expect(() => readGoogleBridgeConfig({})).toThrow("not configured");
    expect(() => readGoogleBridgeConfig({
      GOOGLE_BRIDGE_URL: "https://example.com/macros/s/test/exec",
      GOOGLE_BRIDGE_REQUEST_SECRET: requestSecret,
    })).toThrow("Apps Script");
    expect(() => readGoogleBridgeConfig({
      GOOGLE_BRIDGE_URL: bridgeUrl,
      GOOGLE_BRIDGE_REQUEST_SECRET: "short",
    })).toThrow("at least 32");
    expect(readGoogleBridgeConfig({
      GOOGLE_BRIDGE_URL: bridgeUrl,
      GOOGLE_BRIDGE_REQUEST_SECRET: requestSecret,
    })).toEqual({ url: bridgeUrl, requestSecret });
  });

  it("creates stable URL-safe HMAC signatures", async () => {
    const first = await signBridgeRequest("catalogue\n123\nnonce", requestSecret);
    const second = await signBridgeRequest("catalogue\n123\nnonce", requestSecret);
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await signBridgeRequest("catalogue\n124\nnonce", requestSecret)).not.toBe(first);
  });

  it("accepts only the narrow versioned A/B response contract", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(init?.method).toBe("POST");
      expect(body.action).toBe("catalogue");
      expect(body.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(body.signature).toMatch(/^[A-Za-z0-9_-]+$/);
      return new Response(JSON.stringify({
        ok: true,
        version: 1,
        generatedAt: "2026-09-15T00:00:00.000Z",
        rows: [["AA battery", "18A"], ["Ultrasonic Sensor", ""]],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await expect(requestCatalogueSnapshot({ url: bridgeUrl, requestSecret }, fetcher)).resolves.toEqual({
      generatedAt: "2026-09-15T00:00:00.000Z",
      rows: [["AA battery", "18A"], ["Ultrasonic Sensor", ""]],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
