import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Check if we are building on Vercel or deploying to Vercel
const isVercel = process.env.VERCEL === "1" || process.env.DEPLOY_TARGET === "vercel";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  cloudflare: isVercel ? false : { viteEnvironment: { name: "ssr" } },
  tanstackStart: {
    server: { entry: "server" },
  },
});
