import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToasts } from "../ui/useToasts";

/**
 * §20.4 — custom_field_values rendered and edited per entity wherever
 * definitions exist for that entity_type. Definitions come from settings.
 */
export function CustomFieldsEditor({
  entityType,
  entityId,
}: {
  entityType: "contact" | "project";
  entityId: string;
}) {
  const rows = useQuery(api.customFields.listValues, {
    entityType,
    entityId,
  });
  const setValue = useMutation(api.customFields.setValue);
  const { push } = useToasts();

  const save = async (
    definitionId: Id<"customFieldDefinitions">,
    fieldValue: string,
  ) => {
    try {
      await setValue({ definitionId, entityType, entityId, fieldValue });
    } catch {
      push({ message: "Could not save that value." });
    }
  };

  if (rows === undefined) {
    return <div className="skeleton" style={{ height: 40 }} aria-hidden="true" />;
  }

  return (
    <div className="custom-fields">
      {rows.length === 0 ? (
        <p className="muted">No custom fields for {entityType}s yet — add some in Settings.</p>
      ) : (
        rows.map(({ definition, value }) => (
          <div key={definition._id} className="field">
            <label htmlFor={`cf-${definition._id}`}>{definition.label}</label>
            {definition.fieldType === "select" ? (
              <select
                id={`cf-${definition._id}`}
                className="input"
                defaultValue={value ?? ""}
                onChange={(e) => {
                  void save(definition._id, e.target.value);
                }}
              >
                <option value="">—</option>
                {(definition.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                id={`cf-${definition._id}`}
                className="input"
                type={definition.fieldType === "date" ? "date" : definition.fieldType === "number" ? "number" : "text"}
                defaultValue={value ?? ""}
                onBlur={(e) => {
                  void save(definition._id, e.target.value);
                }}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
