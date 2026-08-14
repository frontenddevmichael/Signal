import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

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

  if (rows === undefined) return null;

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
                  void setValue({
                    definitionId: definition._id,
                    entityType,
                    entityId,
                    fieldValue: e.target.value,
                  });
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
                  void setValue({
                    definitionId: definition._id,
                    entityType,
                    entityId,
                    fieldValue: e.target.value,
                  });
                }}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
