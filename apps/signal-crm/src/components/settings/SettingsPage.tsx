import { GithubConnect } from "../integrations/GithubConnect";
import { GmailConnect } from "../integrations/GmailConnect";
import { WhatsAppConnect } from "../integrations/WhatsAppConnect";
import { SecuritySettings } from "./SecuritySettings";
import { SettingsSection } from "./SettingsSection";
import { BackupSection } from "./BackupSection";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { ExportSection } from "./ExportSection";
import { PreferencesSection } from "./PreferencesSection";
import { useOAuthCallbacks } from "./useOAuthCallbacks";

/**
 * §20.3 — settings is deliberately one level removed from daily-use screens.
 * The page reads as three coherent groups rather than a wall of sections:
 *  - Connections — the external accounts (§9a) and the weekly backup (§21.16)
 *  - Account & security — sessions, API keys, danger zone (§20.13/§20.12/§21.7)
 *  - Data — custom field definitions (§20.4)
 * Each group is a hairline-divided block; the labels are quiet uppercase mono
 * so the structure reads without competing with the section headings.
 */
export function SettingsPage() {
  const { justConnected } = useOAuthCallbacks();

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h2>Settings</h2>
      </div>

      <div className="settings-group">
        <h2 className="settings-group-label">Connections</h2>
        <SettingsSection
          title="Integrations"
          description="External accounts connect here once, and their data flows onto client timelines (§9a)."
        >
          <GithubConnect installationId={justConnected ? "just-connected" : null} />
          <GmailConnect />
          <WhatsAppConnect />
        </SettingsSection>
        <BackupSection />
      </div>

      <div className="settings-group">
        <h2 className="settings-group-label">Account &amp; security</h2>
        <PreferencesSection />
        <SecuritySettings />
      </div>

      <div className="settings-group">
        <h2 className="settings-group-label">Data</h2>
        <ExportSection />
        <CustomFieldsSection />
      </div>
    </div>
  );
}
