import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

// §22.2 — the three typefaces, loaded (self-hosted via Fontsource), not referenced.
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";

import "./index.css";
import App from "./App";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string, {
  unsavedChangesWarning: false,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
