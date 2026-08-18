import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Modal } from "../ui/Modal";
import { useToasts } from "../ui/useToasts";
import { friendlyError } from "../../lib/errors";
import { DOC_TEMPLATES, docTitle, isDocComplete, renderDocBody, type DocType, type DocValues } from "../../lib/documentTemplates";

/**
 * §documents — the New document flow. Pick a template (proposal/contract),
 * fill its field set (client/project/currency pre-filled from the record),
 * see the rendered body live, then store it. The body renders as plain-text
 * paragraphs; a future phase can push the same content through a PDF/print
 * stylesheet (the invoice PDF already has one — §3.7).
 */
export function NewDocumentModal({
  onClose,
  contactId,
}: {
  onClose: () => void;
  contactId: string;
}) {
  const { push } = useToasts();
  const contact = useQuery(api.contacts.get, { contactId: contactId as any });
  const projects = useQuery(api.projects.listByContact, { contactId: contactId as any }) ?? [];
  const create = useMutation(api.documents.create);

  const [type, setType] = useState<DocType>("proposal");
  const [values, setValues] = useState<DocValues>({});
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const seeded = useRef(false);

  const template = DOC_TEMPLATES[type];

  // Seed once, from the record — but only once the contact query has
  // resolved, otherwise the client name lands as "Untitled client" and the
  // guard blocks the re-seed. (The contact comes from the same query the
  // detail page already has cached, so this resolves on first paint in
  // practice — the guard is for cold loads.)
  useEffect(() => {
    if (seeded.current) return;
    if (!contact) return; // wait for the record
    seeded.current = true;
    const seed: DocValues = {};
    if (contact.name) seed.clientName = contact.name;
    if (projects[0]) seed.projectName = projects[0].name;
    seed.currency = "USD";
    setValues((v) => ({ ...seed, ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, projects.length]);

  const body = renderDocBody(type, values);
  const complete = isDocComplete(type, values);

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      await create({
        contactId: contactId as any,
        projectId: projectId ? (projectId as any) : undefined,
        type,
        title: docTitle(type, values),
        content: body,
      });
      push({ message: `${docTitle(type, values)} created` });
      onClose();
    } catch (e) {
      setError(friendlyError(e, "Could not create the document."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New document" width={620}>
      <div className="field" role="radiogroup" aria-label="Template">
        <label>Template</label>
        <div className="doc-template-row">
          {(Object.keys(DOC_TEMPLATES) as DocType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={`doc-template-card${type === t ? " is-active" : ""}`}
              onClick={() => setType(t)}
            >
              <strong>{DOC_TEMPLATES[t].label}</strong>
              <span className="muted">{DOC_TEMPLATES[t].blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="nd-project">Project (optional)</label>
          <select id="nd-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— no project —</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {template.fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`nd-${f.key}`} className="required">{f.label}</label>
            <input
              id={`nd-${f.key}`}
              className="input"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>

      <div className="doc-preview" aria-label="Document preview">
        <h4>{docTitle(type, values)}</h4>
        {body.split("\n").map((line, i) =>
          line ? <p key={i}>{line}</p> : <div key={i} aria-hidden="true" style={{ height: 10 }} />
        )}
      </div>

      {error && (
        <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={pending || !complete}>
          {pending && <span className="spinner" aria-hidden="true" />}
          Create {template.label}
        </button>
      </div>
    </Modal>
  );
}
