import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

// §22.2 — the three typefaces, loaded (self-hosted via Fontsource), not referenced.
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";

import "./index.css";
import App from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "Missing VITE_CONVEX_URL. " +
    "Set it in your .env.local for local dev, or in Vercel → Settings → Environment Variables for production. " +
    "See https://docs.convex.dev/production/hosting/",
  );
}
const convex = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
