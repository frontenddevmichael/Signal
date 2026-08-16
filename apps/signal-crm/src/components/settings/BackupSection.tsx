import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SettingsSection } from "./SettingsSection";

/**
 * §21.16 — weekly backup status card. Mirrors the integration-card shape: the
 * server reports whether S3-compatible env vars are set and on what schedule.
 * The job itself runs as a server-side cron (Mondays 02:00 UTC), not here.
 */
export function BackupSection() {
  const status = useQuery(api.backup.status);
  return (
    <SettingsSection
      title="Backup"
      description="A weekly export of your data to S3-compatible storage. Runs automatically — nothing to schedule."
    >
      {status === undefined ? (
        <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />
      ) : (
        <div className="integration-card surface-card card-hover">
          <div className="integration-head">
            <span className={`status ${status.configured ? "status-active" : ""}`}>
              {status.configured ? "configured" : "not configured"}
            </span>
            <div>
              <strong>Weekly backup</strong>
              <div className="muted">{status.schedule}</div>
            </div>
          </div>
          <p className="muted" style={{ margin: "8px 0 0" }}>{status.note}</p>
          {!status.configured && (
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Set <code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>,{" "}
              <code>BACKUP_S3_ACCESS_KEY_ID</code>, <code>BACKUP_S3_SECRET_ACCESS_KEY</code> to enable.
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
