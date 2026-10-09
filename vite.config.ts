import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/** Long-lived vendor chunks so app deploys do not invalidate library caches. */
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return "vendor-react";
  if (id.includes("@supabase")) return "vendor-supabase";
  if (id.includes("@tanstack")) return "vendor-query";
  if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "vendor-ui";
  if (id.includes("date-fns")) return "vendor-date";
  if (id.includes("lucide-react")) return "vendor-icons";
  // recharts and the d3 pieces it pulls in: only chart pages load this, and it caches on its own.
  if (/node_modules\/(recharts|recharts-scale|victory-vendor|internmap|d3-[a-z-]+)\//.test(id)) return "vendor-charts";
  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
}));
