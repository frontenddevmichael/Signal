import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { timeAgo } from "../../lib/format";
import { EmptyState } from "../EmptyState";

const GLYPH: Record<string, string> = {
  pr_merged: "⤵",
  issue_closed: "✓",
  deploy: "▲",
};

/**
 * §14 "Linked repos & activity" — merged PRs / closed issues / deploys,
 * filtered to this contact, newest first. Rendered from repo_activity (written
 * once per project_repos link, §9) — the same events also appear on the
 * timeline via the shared writeTimelineEvent helper.
 */
export function RepoActivity({ contactId, onGoToProjects }: { contactId: string; onGoToProjects?: () => void }) {
  const rows = useQuery(api.github.activityForContact, { contactId: contactId as any });

  if (rows === undefined) {
    return (
      <div className="skeleton-stagger" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No repo activity yet"
        body="Merged PRs, closed issues and deploys for this client's linked repos land here — and on the timeline. Repos are linked from a project."
        action={
          onGoToProjects ? (
            <button type="button" className="btn btn-primary" onClick={onGoToProjects}>
              Go to projects
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="activity-list" aria-label="Repo activity">
      {rows.map(({ activity, repoName, projectName }) => (
        <li key={activity._id} className="activity-row surface-card">
          <span className="activity-glyph" aria-hidden="true">
            {GLYPH[activity.type] ?? "•"}
          </span>
          <div className="activity-main">
            <a href={activity.url} target="_blank" rel="noreferrer">
              {activity.title}
            </a>
            <div className="muted num">
              {repoName} · {projectName} · {timeAgo(activity.occurredAt)}
            </div>
          </div>
          <span className={`status status-${activity.billable ? "active" : "muted"}`}>
            {activity.billable ? "billable" : "not billable"}
          </span>
        </li>
      ))}
    </ul>
  );
}
