import type { ReactNode } from "react";

/**
 * Settings layout primitive — one section of the settings page. Kills the
 * repeated `<section className="detail-section">…<div className="section-head">`
 * boilerplate that every settings block was re-typing. `action` lands in the
 * header row (Add field, Create key); `description` renders as the muted
 * intro line under the heading.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {description && <p className="muted settings-desc">{description}</p>}
      {children}
    </section>
  );
}
