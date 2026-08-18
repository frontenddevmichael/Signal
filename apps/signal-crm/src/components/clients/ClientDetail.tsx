import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatMoney, formatTags, timeAgo } from "../../lib/format";
import { EmptyState } from "../EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { ContactForm } from "./ContactForm";
import { ClientCalendar } from "./ClientCalendar";
import { MergeDialog } from "./MergeDialog";
import { NoteComposer } from "../notes/NoteComposer";
import { Timeline } from "../timeline/Timeline";
import { ProjectForm } from "../projects/ProjectForm";
import { ProjectCard } from "../projects/ProjectCard";
import { CustomFieldsEditor } from "../customFields/CustomFieldsEditor";
import { RepoActivity } from "../repos/RepoActivity";
import { GmailSetupBlock } from "../gmail/GmailSetupBlock";
import { ReplyBox } from "../gmail/ReplyBox";
import { MeetingsPanel } from "../meetings/MeetingsPanel";
import { DocumentsPanel } from "../documents/DocumentsPanel";
import { PortalLinkButton } from "../portal/PortalLinkButton";
import { IconMoney, IconPlus, IconRepo, IconSearch } from "../Icons";

type Tab = "timeline" | "projects" | "repos" | "docs" | "financials";

const TABS: { id: Tab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "projects", label: "Projects" },
  { id: "repos", label: "Repos" },
  { id: "docs", label: "Docs" },
  { id: "financials", label: "Financials" },
];

/**
 * §14 full client detail information architecture, laid out per §22.7's
 * reference (tabs: Timeline | Repos | Docs | Financials; Projects added since
 * repos/links attach to projects). Sections that stay empty until later phases
 * use the §22.15 empty-state pattern — present, not missing.
 */
export function ClientDetail() {
  const { contactId = "" } = useParams();
  const navigate = useNavigate();
  const { push } = useToasts();
  const data = useQuery(api.contacts.get, { contactId: contactId as any });
  const stats = useQuery(api.contacts.stats, { contactId: contactId as any });
  const timelineEvents = useQuery(api.timeline.getForContact, { contactId: contactId as any });
  const removeContact = useMutation(api.contacts.remove);
  const undoDelete = useMutation(api.contacts.undoDelete);

  const [tab, setTab] = useState<Tab>("timeline");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // §22.14 — full tablist ARIA: roving tabindex (only the active tab is in the
  // tab order), arrow-key activation with Home/End, and panels bound to their
  // tab via aria-controls/aria-labelledby. ArrowLeft wraps to the last tab so
  // the strip never dead-ends at either edge.
  const onTabKey = (e: React.KeyboardEvent, idx: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = idx + 1 === TABS.length ? 0 : idx + 1;
    else if (e.key === "ArrowLeft") next = idx === 0 ? TABS.length - 1 : idx - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next !== -1) {
      e.preventDefault();
      setTab(TABS[next].id);
      tabRefs.current[next]?.focus();
    }
  };
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [mergeWith, setMergeWith] = useState<string | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");

  const searchHits = useQuery(api.contacts.search, {
    term: mergeQuery.trim() || "___none___",
  });

  const contact = data?.contact;

  // §14 relationship health: days since last contact → beacon when the
  // relationship is going cold (no activity, or stale by 14+ days).
  // The timeline is ordered desc, so skip future-dated rows (scheduled
  // meetings) — a future meeting is not "last contact".
  const lastEvent =
    timelineEvents?.find((e) => e.occurredAt <= Date.now())?.occurredAt ?? null;
  const daysSince = lastEvent ? Math.floor((Date.now() - lastEvent) / 86400000) : null;
  const healthStale = lastEvent === null || (daysSince !== null && daysSince >= 14);

  // §2.2 health visual — 5-dot recency scale: each dot is a 7-day window of
  // freshness, dimming as the relationship goes cold; the beacon marks the
  // §14 action line (14+ days). Monochrome: contrast does the work, not hue.
  const freshDots =
    daysSince === null ? 0 : Math.max(0, Math.min(5, 5 - Math.floor(daysSince / 7)));

  if (data === undefined) {
    return <div className="skeleton" style={{ height: 200 }} aria-hidden="true" />;
  }
  if (!data || !contact) {
    return <EmptyState title="Client not found" body="This client doesn't exist or you don't have access." />;
  }

  const { emails, phones, projects } = data;

  const statsCurrency = stats?.invoices?.[0]?.currency ?? "USD";

  const doDelete = async () => {
    // The ConfirmDialog owns the pending spinner while this runs; a throwing
    // removeContact surfaces inline in the dialog (Phase 2b contract).
    const res = await removeContact({ contactId: contactId as any });
    // §23.3 — delete is reversible within the toast window: re-insert the
    // subtree and land back on the restored client.
    push({
      message: `${contact.name} deleted`,
      undoLabel: "Undo",
      onUndo: () => {
        void undoDelete({ undoId: res.undoId })
          .then((r) => navigate(`/clients/${r.contactId}`))
          .catch(() => push({ message: "Could not restore the client." }));
      },
    });
    navigate("/");
  };

  return (
    <div className="client-detail">
      <div className="detail-head surface-card">
        <div className="detail-title-row">
          <h2>
            {contact.name}
            {contact.company && <span className="detail-company"> — {contact.company}</span>}
          </h2>
          <span className={`status status-${contact.status}`}>{contact.status}</span>
        </div>

        <div className="detail-meta">
          <div className="meta-block">
            <span className="meta-label">Emails</span>
            {emails.length ? (
              emails.map((e) => (
                <div key={e._id} className="meta-value num">
                  {e.email}
                  {e.isPrimary && <span className="primary-tag">primary</span>}
                </div>
              ))
            ) : (
              <div className="meta-value muted">—</div>
            )}
          </div>
          <div className="meta-block">
            <span className="meta-label">Phones</span>
            {phones.length ? (
              phones.map((p) => (
                <div key={p._id} className="meta-value num">
                  {p.phoneNumber}
                  {p.isPrimary && <span className="primary-tag">primary</span>}
                </div>
              ))
            ) : (
              <div className="meta-value muted">—</div>
            )}
          </div>
          <div className="meta-block">
            <span className="meta-label">Source</span>
            <div className="meta-value">{contact.source ?? "—"}</div>
          </div>
          <div className="meta-block">
            <span className="meta-label">Timezone</span>
            <div className="meta-value num">{contact.timezone ?? "—"}</div>
          </div>
          {contact.tags.length > 0 && (
            <div className="meta-block">
              <span className="meta-label">Tags</span>
              <div className="meta-value">{formatTags(contact.tags)}</div>
            </div>
          )}
          <div className="meta-block">
            <span className="meta-label">Health</span>
            <div className="meta-value health-row">
              <span className="health-dots" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`health-dot${i < freshDots ? " filled" : ""}`} />
                ))}
              </span>
              {healthStale && <span className="beacon-dot" aria-hidden="true" />}
              {lastEvent ? `${timeAgo(lastEvent)} since last contact` : "No contact yet"}
            </div>
          </div>
        </div>

        <div className="detail-actions">
          <PortalLinkButton contactId={contactId as Id<"contacts">} />
          <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMergePickerOpen(true)}>
            Merge…
          </button>
          <button type="button" className="btn btn-danger-ghost" onClick={() => setDeleteOpen(true)}>
            Delete
          </button>
        </div>
      </div>

      {/* §2.2 — the stats strip: mono numerals at 300 weight, the "lived-in"
          register of the layout reference. Renders once stats resolve. */}
      {stats && (
        <div className="stats-strip" aria-label="Client statistics">
          <div className="stat">
            <span className="stat-value num">{formatMoney(stats.totalBilled, statsCurrency)}</span>
            <span className="stat-label">Total billed</span>
          </div>
          <div className="stat">
            <span className="stat-value num">{stats.openInvoices}</span>
            <span className="stat-label">Open invoices</span>
          </div>
          <div className="stat">
            <span className="stat-value num">
              {lastEvent ? `${daysSince}d ago` : "—"}
            </span>
            <span className="stat-label">Last contact</span>
          </div>
          <div className="stat">
            <span className="stat-value num">{stats.activeProjects}</span>
            <span className="stat-label">Active projects</span>
          </div>
        </div>
      )}

      <div className="detail-tabs" role="tablist" aria-label="Client sections">
        {TABS.map((t, i) => {
          const count =
            t.id === "projects"
              ? stats?.projectsCount
              : t.id === "repos"
                ? stats?.repoCount
                : t.id === "financials" && (stats?.openInvoices ?? 0) > 0
                  ? stats?.openInvoices
                  : undefined;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`client-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`client-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
              {count !== undefined && count > 0 && (
                <span className="tab-count num">
                  {t.id === "financials" ? `${count} unpaid` : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "timeline" && (
        <section role="tabpanel" id="client-panel-timeline" aria-labelledby="client-tab-timeline">
          <ClientCalendar contactId={contactId as Id<"contacts">} />
          <NoteComposer contactId={contactId} />
          <MeetingsPanel contactId={contactId as Id<"contacts">} />
          <GmailSetupBlock contactId={contactId as Id<"contacts">} />
          <ReplyBox contactId={contactId as Id<"contacts">} to={emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? null} />
          <Timeline contactId={contactId} />
        </section>
      )}

      {tab === "projects" && (
        <section role="tabpanel" id="client-panel-projects" aria-labelledby="client-tab-projects">
          <div className="section-head">
            <h3>Projects</h3>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setProjectFormOpen(true)}>
              <IconPlus aria-hidden="true" style={{ width: 14, height: 14 }} />
              Add project
            </button>
          </div>
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" body="A project is where repos, invoices and deadlines attach." />
          ) : (
            <div className="project-grid">
              {projects.map((p) => (
                <ProjectCard key={p._id} project={p} contactId={contactId} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "repos" && (
        <section role="tabpanel" id="client-panel-repos" aria-labelledby="client-tab-repos">
          <RepoActivity contactId={contactId} onGoToProjects={() => setTab("projects")} />
        </section>
      )}
      {tab === "docs" && (
        <section role="tabpanel" id="client-panel-docs" aria-labelledby="client-tab-docs">
          <DocumentsPanel contactId={contactId} />
        </section>
      )}
      {tab === "financials" && (
        <section role="tabpanel" id="client-panel-financials" aria-labelledby="client-tab-financials">
          {stats?.invoices && stats.invoices.length > 0 ? (
            <>
              <div className="section-head">
                <h3>Invoices</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th className="ta-r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.invoices.map((inv) => (
                      <tr
                        key={inv._id}
                        className="row-link"
                        role="link"
                        tabIndex={0}
                        aria-label={`Open invoice ${inv.invoiceNumber}`}
                        onClick={() => navigate(`/invoices/${inv._id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/invoices/${inv._id}`);
                          }
                        }}
                      >
                        <td className="num">{inv.invoiceNumber}</td>
                        <td>
                          <span className={`status status-${inv.status}`}>{inv.status}</span>
                        </td>
                        <td className="num">{inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "—"}</td>
                        <td className="num">{inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "—"}</td>
                        <td className="num ta-r">{formatMoney(inv.total, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<IconMoney aria-hidden="true" />}
              title="No invoices yet"
              body="Create an invoice from a project and it lands here — total billed, open balance and payment history at a glance."
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    // Hand off through sessionStorage: the bus event can fire
                    // before the invoices list mounts (a race the palette
                    // never hits because it's always mounted). The list
                    // checks + clears this on mount.
                    sessionStorage.setItem("signal:new-invoice", "1");
                    navigate("/invoices");
                  }}
                >
                  Create invoice
                </button>
              }
            />
          )}
        </section>
      )}

      <div className="detail-section">
        <h3>Custom fields</h3>
        <CustomFieldsEditor entityType="contact" entityId={contactId} />
      </div>

      {editOpen && (
        <ContactForm
          open
          onClose={() => setEditOpen(false)}
          initial={{
            contactId,
            name: contact.name,
            company: contact.company,
            status: contact.status,
            source: contact.source,
            tags: contact.tags,
            timezone: contact.timezone,
            emails: emails.map((e) => ({ email: e.email, isPrimary: e.isPrimary })),
            phones: phones.map((p) => ({ phoneNumber: p.phoneNumber, isPrimary: p.isPrimary })),
          }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="Delete client"
        body={
          <>
            This will permanently delete <strong>{contact.name}</strong> and everything attached:{" "}
            {projects.length} project{projects.length === 1 ? "" : "s"}, notes, and timeline history.
            You can undo this from the toast that appears right after.
          </>
        }
        confirmLabel="Delete client"
      />

      {projectFormOpen && (
        <ProjectForm open onClose={() => setProjectFormOpen(false)} contactId={contactId} />
      )}

      {mergePickerOpen && (
        <Modal open onClose={() => setMergePickerOpen(false)} title="Merge with another client" width={460}>
          <div className="search-box" style={{ marginBottom: 12 }}>
            <IconSearch aria-hidden="true" />
            <input
              type="search"
              className="input search-input"
              placeholder="Search clients…"
              aria-label="Search clients to merge"
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="merge-picker-list">
            {(searchHits ?? [])
              .filter((c) => c._id !== contactId)
              .slice(0, 6)
              .map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className="merge-picker-row"
                  onClick={() => {
                    setMergeWith(c._id);
                    setMergePickerOpen(false);
                  }}
                >
                  <strong>{c.name}</strong>
                  {c.company && <span className="muted"> — {c.company}</span>}
                </button>
              ))}
            {mergeQuery.trim() && (searchHits ?? []).length === 0 && (
              <p className="muted">No matching clients.</p>
            )}
          </div>
        </Modal>
      )}

      {mergeWith && (
        <MergeDialog
          contactId={contactId}
          otherContactId={mergeWith}
          onClose={() => {
            setMergeWith(null);
          }}
        />
      )}
    </div>
  );
}
