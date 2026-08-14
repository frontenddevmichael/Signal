import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ImportRepoDialog } from "./ImportRepoDialog";
import { useToasts } from "../ui/useToasts";
import { IconGitHub } from "../Icons";

/**
 * §9a — repos import onto a PROJECT (not the contact), matching project_repos.
 * Disconnected repos (uninstall / permission downgrade, §20.3) show the §22.15
 * error state with Reconnect as the primary action.
 */
export function ProjectRepos({ projectId }: { projectId: Id<"projects"> }) {
  const repos = useQuery(api.github.reposForProject, { projectId });
  const removeLink = useMutation(api.github.removeRepoLink);
  const { push } = useToasts();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (repos === undefined) return <div className="skeleton" style={{ height: 40 }} aria-hidden="true" />;

  return (
    <div className="project-repos">
      <div className="section-head" style={{ marginTop: 12 }}>
        <h4>Linked repos</h4>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)}>
          <IconGitHub style={{ width: 14, height: 14 }} />
          Import repo
        </button>
      </div>

      {repos.length === 0 ? (
        <p className="muted">No repos linked yet. Import one to stream merged PRs and closed issues here.</p>
      ) : (
        <ul className="repo-list">
          {repos.map(({ repo, projectRepoId }) => (
            <li key={repo._id} className={`repo-row${repo.connectionStatus === "disconnected" ? " disconnected" : ""}`}>
              <div className="repo-row-main">
                <strong>{repo.fullName}</strong>
                {repo.connectionStatus === "disconnected" && (
                  <span className="repo-disconnected">disconnected — re-import to reconnect</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={async () => {
                  await removeLink({ projectRepoId });
                  push({ message: `${repo.fullName} unlinked` });
                }}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && <ImportRepoDialog projectId={projectId} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
