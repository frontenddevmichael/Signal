import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { dueLabel, formatDate } from "../../lib/format";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToasts } from "../ui/useToasts";
import { ProjectForm } from "./ProjectForm";
import { ProjectRepos } from "./ProjectRepos";
import { CustomFieldsEditor } from "../customFields/CustomFieldsEditor";

export function ProjectCard({
  project,
  contactId,
}: {
  project: {
    _id: string;
    name: string;
    status: "active" | "closed";
    deadline?: number;
    description?: string;
  };
  contactId: string;
}) {
  const removeProject = useMutation(api.projects.remove);
  const { push } = useToasts();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Deadline chip — a countdown register, not a bare date: overdue gets the
  // critical treatment, "due soon" (≤7d) a nudge, active-but-far stays quiet.
  const now = Date.now();
  const deadlineStatus =
    project.deadline !== undefined && project.status === "active"
      ? project.deadline < now
        ? "overdue"
        : project.deadline <= now + 7 * 86400000
          ? "soon"
          : null
      : null;

  return (
    <div className="project-card surface-card card-hover">
      <div className="project-card-head">
        <h4>{project.name}</h4>
        <span className={`status status-${project.status === "active" ? "pending" : "void"}`}>
          {project.status}
        </span>
      </div>
      {project.description && <p className="project-desc">{project.description}</p>}
      <div className="project-meta num">
        {project.deadline ? (
          deadlineStatus ? (
            <span className={`deadline-chip${deadlineStatus === "overdue" ? " overdue" : ""}`}>
              <span className="cal-dot" aria-hidden="true" />
              {deadlineStatus === "overdue" ? "Overdue" : dueLabel(project.deadline)}
            </span>
          ) : (
            <span>Deadline {formatDate(project.deadline)}</span>
          )
        ) : (
          <span className="muted">No deadline</span>
        )}
      </div>
      <CustomFieldsEditor entityType="project" entityId={project._id} />
      <ProjectRepos projectId={project._id as Id<"projects">} />
      <div className="project-card-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
          Edit
        </button>
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setDeleteOpen(true)}>
          Delete
        </button>
      </div>

      {editOpen && (
        <ProjectForm
          open
          onClose={() => setEditOpen(false)}
          contactId={contactId}
          initial={{
            projectId: project._id,
            name: project.name,
            status: project.status,
            deadline: project.deadline,
            description: project.description,
          }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await removeProject({ projectId: project._id as Id<"projects"> });
          push({ message: `${project.name} deleted` });
        }}
        title="Delete project"
        body={
          <>
            This will permanently delete <strong>{project.name}</strong> and its notes. This can’t be
            undone.
          </>
        }
        confirmLabel="Delete project"
      />
    </div>
  );
}
