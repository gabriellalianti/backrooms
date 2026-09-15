import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const configPath =
    mode === "cloudflare-production"
      ? "./wrangler.production.jsonc"
      : "./wrangler.jsonc";

  return {
    plugins: [react(), cloudflare({ configPath })],
  };
});
