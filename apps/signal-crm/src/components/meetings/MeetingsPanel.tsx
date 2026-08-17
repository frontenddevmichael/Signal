import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToasts } from "../ui/useToasts";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { formatDateTime } from "../../lib/format";
import { friendlyError } from "../../lib/errors";

/**
 * §6 meetings — local meetings attached to a client (calendarEvents rows with a
 * manual marker). They render as the "meeting" chip on the Calendar month grid
 * and as a "call" entry on the timeline. Real Google Calendar sync is a
 * separate feature, so this is the manual path: add / list / remove.
 */
export function MeetingsPanel({ contactId }: { contactId: Id<"contacts"> }) {
  const meetings = useQuery(api.meetings.listForContact, { contactId });
  const createMeeting = useMutation(api.meetings.createMeeting);
  const removeMeeting = useMutation(api.meetings.removeMeeting);
  const { push } = useToasts();

  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ _id: Id<"calendarEvents">; title: string } | null>(null);

  const submit = async () => {
    setError(null);
    if (!title.trim() || !start) {
      setError("Meeting needs a title and a start time.");
      return;
    }
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : startMs + 3600000;
    if (endMs <= startMs) {
      setError("End time must be after the start time.");
      return;
    }
    setPending(true);
    try {
      await createMeeting({
        contactId,
        title: title.trim(),
        startTime: startMs,
        endTime: endMs,
        meetLink: meetLink.trim() || undefined,
      });
      setTitle("");
      setStart("");
      setEnd("");
      setMeetLink("");
      push({ message: "Meeting added" });
    } catch (e) {
      setError(friendlyError(e, "Could not add meeting."));
    } finally {
      setPending(false);
    }
  };

  const doRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMeeting({ eventId: removeTarget._id });
      push({ message: `${removeTarget.title} removed` });
      setRemoveTarget(null);
    } catch {
      push({ message: "Could not remove the meeting." });
    }
  };

  return (
    <div className="meetings-panel surface-card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h3>Meetings</h3>
      </div>

      {meetings === undefined ? (
        <div className="skeleton" style={{ height: 60 }} aria-hidden="true" />
      ) : meetings.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>
          No meetings yet — record one and it appears on the calendar and timeline.
        </p>
      ) : (
        <div className="meetings-list">
          {meetings.map((m) => (
            <div key={m._id} className="list-row">
              <div>
                <strong>{m.title}</strong>
                <div className="muted num">{formatDateTime(m.startTime)}</div>
                {m.meetLink && (
                  <a href={m.meetLink} target="_blank" rel="noreferrer" className="meet-link">
                    {m.meetLink}
                  </a>
                )}
              </div>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => setRemoveTarget({ _id: m._id, title: m.title })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="meetings-form">
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor={`mt-title-${contactId}`}>Title</label>
            <input
              id={`mt-title-${contactId}`}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kickoff call"
            />
          </div>
          <div className="field">
            <label htmlFor={`mt-link-${contactId}`}>Meet link (optional)</label>
            <input
              id={`mt-link-${contactId}`}
              className="input"
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor={`mt-start-${contactId}`} className="required">Start</label>
            <input
              id={`mt-start-${contactId}`}
              type="datetime-local"
              className="input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`mt-end-${contactId}`}>End</label>
            <input
              id={`mt-end-${contactId}`}
              type="datetime-local"
              className="input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={pending}>
              {pending ? "Adding…" : "Add meeting"}
            </button>
          </div>
        </div>
        {error && (
          <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={doRemove}
        title="Remove meeting"
        body={
          <>
            This removes <strong>{removeTarget?.title}</strong> and its timeline entry.
          </>
        }
        confirmLabel="Remove"
      />
    </div>
  );
}