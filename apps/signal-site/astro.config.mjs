// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    ssr: {
      // signal-ui is a linked file: package — Astro must transform its TSX.
      noExternal: ["signal-ui"],
    },
    optimizeDeps: {
      include: ["signal-ui/SignalBar", "signal-ui/Icons", "signal-ui/StatusChip", "signal-ui/Squircle"],
    },
  },
});
