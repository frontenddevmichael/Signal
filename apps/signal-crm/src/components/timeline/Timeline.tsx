import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { timeUntil } from "../../lib/format";
import { EmptyState } from "../EmptyState";

const TYPE_META: Record<string, { label: string; glyph: string }> = {
  note: { label: "Note added", glyph: "✎" },
  email: { label: "Email", glyph: "✉" },
  whatsapp: { label: "WhatsApp", glyph: "◈" },
  invoice: { label: "Invoice", glyph: "₦" },
  repo_activity: { label: "GitHub", glyph: "⌥" },
  document: { label: "Document", glyph: "▤" },
  call: { label: "Call", glyph: "☎" },
};

function NoteBody({ sourceId }: { sourceId: string }) {
  // §14 — a timeline event is a projection; the note body lives in notes.
  const note = useQuery(api.notes.getById, { noteId: sourceId as any });
  if (!note) return <p className="timeline-note-body skeleton" aria-hidden="true" />;
  return (
    <div
      className="timeline-note-body"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: note.body }}
    />
  );
}

/**
 * §14 — the unified per-contact feed: one scroll, chronological, source-
 * agnostic. Rendered from timeline_events (the ONLY source table for this
 * view, thanks to the §18 write-path rule).
 */
export function Timeline({ contactId }: { contactId: string }) {
  const events = useQuery(api.timeline.getForContact, { contactId: contactId as any });

  if (events === undefined) {
    return (
      <div className="skeleton-stagger" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 64, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Notes, emails, invoices and GitHub activity will land here in one chronological scroll."
      />
    );
  }

  return (
    <ol className="timeline" aria-label="Relationship timeline">
      {events.map((e) => {
        const meta = TYPE_META[e.type] ?? { label: e.type, glyph: "•" };
        return (
          <li key={e._id} className="timeline-item">
            <span className="timeline-glyph" aria-hidden="true">
              {meta.glyph}
            </span>
            <div className="timeline-content">
              <div className="timeline-head">
                <span className="timeline-label">{meta.label}</span>
                <time className="num" dateTime={new Date(e.occurredAt).toISOString()}>
                  {timeUntil(e.occurredAt)}
                </time>
              </div>
              {e.type === "note" && <NoteBody sourceId={e.sourceId} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
