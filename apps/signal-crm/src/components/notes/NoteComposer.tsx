import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * §18 notes are rich-text. TipTap (headless, React-native) with StarterKit for
 * bold/italic/lists — a basic editor, not a bespoke one. Creating a note goes
 * through notes.create, which writes the timeline event via the shared helper.
 */
export function NoteComposer({
  contactId,
  projectId,
  onSaved,
}: {
  contactId: string;
  projectId?: string;
  onSaved?: () => void;
}) {
  const createNote = useMutation(api.notes.create);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: { class: "note-editor", "aria-label": "Note body" },
    },
  });

  const submit = async () => {
    const body = editor?.getHTML() ?? "";
    if (body === "<p></p>" || body.trim() === "") return;
    setPending(true);
    setError(null);
    try {
      await createNote({
        contactId: contactId as Id<"contacts">,
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        body,
      });
      editor?.commands.clearContent();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="note-composer surface-card">
      <div className="note-toolbar">
        <button
          type="button"
          className={`note-tool${editor?.isActive("bold") ? " active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`note-tool${editor?.isActive("italic") ? " active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`note-tool${editor?.isActive("bulletList") ? " active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          •≡
        </button>
        <button
          type="button"
          className={`note-tool${editor?.isActive("heading", { level: 3 }) ? " active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Heading"
        >
          H
        </button>
      </div>
      <EditorContent editor={editor} />
      {error && (
        <div className="field-error-message" role="alert" style={{ margin: "8px 0" }}>
          {error}
        </div>
      )}
      <div className="note-composer-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={pending}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          Add note
        </button>
      </div>
    </div>
  );
}
