import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";

interface PickerRepo {
  id: number;
  full_name: string;
  html_url: string;
  connected: boolean;
  alreadyLinked: { contactName: string; projectId: string }[];
}

/**
 * §9a step 4-5 — "Import repo" on a project. Calls the installation's repo
 * list and shows the picker. Repos already linked to another client are FLAGGED
 * inline ("Already linked to Acme Co."), never hidden or blocked — §9a's
 * explicit decision, since a repo can legitimately belong to more than one
 * project (agency monorepo, §9).
 */
export function ImportRepoDialog({
  projectId,
  onClose,
}: {
  projectId: Id<"projects">;
  onClose: () => void;
}) {
  const loadRepos = useAction(api.githubActions.availableRepos);
  const importRepo = useMutation(api.github.importRepo);
  const { push } = useToasts();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [result, setResult] = useState<{ repos: PickerRepo[]; error: string | null } | null>(null);

  // Load lazily on first open — a render-phase `setLoaded(true)` +
  // `loadRepos()` would dispatch the GitHub API call DURING render and fire
  // it TWICE under StrictMode (the audit's defect). Effect + ref guard: the
  // call fires exactly once, after mount, never during render.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadRepos()
      .then(setResult)
      .catch(() => setResult({ repos: [], error: "Could not reach GitHub right now." }));
  }, [loadRepos]);

  const repos = result?.repos ?? [];
  const error = result?.error ?? null;

  const doImport = async (githubRepoId: number, fullName: string) => {
    setPendingId(githubRepoId);
    try {
      await importRepo({ projectId, githubRepoId, fullName });
      push({ message: `${fullName} linked — backfilling history` });
      onClose();
    } catch (e) {
      push({ message: e instanceof Error ? e.message : "Could not import repo." });
      setPendingId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Import repo" width={560}>
      {error ? (
        <p className="field-error-message" role="alert">
          {error}
        </p>
      ) : repos.length === 0 && result !== null ? (
        <p className="muted">No repos found. Install the GitHub App first (Settings → GitHub).</p>
      ) : repos.length === 0 ? (
        <p className="muted">Loading repos…</p>
      ) : (
        <ul className="repo-picker">
          {repos.map((r) => (
            <li key={r.id} className="repo-row">
              <div className="repo-row-main">
                <strong>{r.full_name}</strong>
                {r.alreadyLinked.length > 0 && (
                  <span className="already-linked">
                    Already linked to {r.alreadyLinked.map((l) => l.contactName).join(", ")}
                  </span>
                )}
                {!r.connected && <span className="repo-disconnected">disconnected — will reconnect</span>}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void doImport(r.id, r.full_name)}
                disabled={pendingId !== null}
              >
                {pendingId === r.id ? <span className="spinner" aria-hidden="true" /> : null}
                {pendingId === r.id ? "Linking…" : "Import"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
