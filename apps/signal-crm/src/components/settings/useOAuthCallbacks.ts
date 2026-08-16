import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useToasts } from "../ui/useToasts";

/**
 * OAuth redirect plumbing for the settings page, extracted out of
 * SettingsPage. Two callbacks land back here with a query param:
 *  - §9a step 3 — GitHub redirects with ?installation_id=… → store it.
 *  - §17 — Gmail OAuth redirects with ?gmail=connected|error&msg=… → toast it.
 * Both strip their param from the URL after handling (no stale re-fire on
 * refresh). `justConnected` drives the GitHub card's success state.
 */
export function useOAuthCallbacks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const storeInstallation = useMutation(api.github.storeInstallation);
  const { push } = useToasts();
  const [justConnected, setJustConnected] = useState(false);

  // §9a step 3 — GitHub redirects back with ?installation_id=…
  useEffect(() => {
    const installIdParam = searchParams.get("installation_id");
    if (!installIdParam) return;
    const id = Number(installIdParam);
    if (Number.isFinite(id)) {
      void storeInstallation({ installationId: id })
        .then(() => setJustConnected(true))
        .catch(() => push({ message: "Could not store the GitHub installation." }));
    }
    setSearchParams({}, { replace: true }); // strip the param
  }, [searchParams, storeInstallation, setSearchParams, push]);

  // §17 — the OAuth callback redirects back with ?gmail=connected|error&msg=…
  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (!gmailParam) return;
    if (gmailParam === "connected") {
      push({ message: "Gmail connected — client emails now send from your own identity." });
    } else {
      const msg = searchParams.get("msg");
      push({ message: `Gmail connect failed: ${msg ?? "unknown error"}` });
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, push]);

  return { justConnected };
}
