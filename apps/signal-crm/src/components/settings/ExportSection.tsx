import { useState } from "react";
import { useConvex } from "convex/react";
import JSZip from "jszip";
import { api } from "../../../convex/_generated/api";
import { buildExportBundle } from "../../lib/export";
import type { ExportDataset } from "../../lib/export";
import { SettingsSection } from "./SettingsSection";
import { useToasts } from "../ui/useToasts";

/** Local date for the archive filename — the user's timezone (matches every
 *  other date the UI renders; the manifest's generatedAt is UTC). */
function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * §4 full-data export — take it with you. The button fetches the full dataset
 * (api.exportData.all), builds the bundle locally (src/lib/export.ts), zips it
 * in the browser, and saves signal-export-YYYY-MM-DD.zip. Nothing is uploaded,
 * nothing stored server-side — the file is the deliverable.
 */
export function ExportSection() {
  // One-shot query on demand (not a reactive useQuery — the dataset is large
  // and only needed when the button is pressed).
  const convex = useConvex();
  const { push } = useToasts();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = (await convex.query(api.exportData.all)) as unknown as ExportDataset;
      const files = buildExportBundle(data);
      const zip = new JSZip();
      for (const f of files) zip.file(f.filename, f.content);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signal-export-${stamp()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      push({ message: "Archive built — check your downloads." });
    } catch {
      push({ message: "Could not build the export right now. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="Export your data"
      description="Everything you own — the full JSON set plus spreadsheet CSVs — built in your browser into a single archive. Nothing leaves your account except the file you download (§4 no lock-in)."
    >
      <div className="integration-card surface-card card-hover">
        <div className="integration-head">
          <div>
            <strong>Full data archive</strong>
            <div className="muted">JSON + CSV — money in minor units, dates in UTC</div>
          </div>
          <button
            type="button"
            className={`btn btn-primary btn-sm${busy ? " is-pending" : ""}`}
            onClick={() => void download()}
            disabled={busy}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {busy ? "Building…" : "Download archive"}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}