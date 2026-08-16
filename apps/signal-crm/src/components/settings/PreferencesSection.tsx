import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useToasts } from "../ui/useToasts";
import { SettingsSection } from "./SettingsSection";
import { TIMEZONE_GROUPS, defaultTimezone } from "../../lib/timezones";
import { IconMoon, IconMonitor, IconSun } from "../Icons";

type ThemePreference = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof IconSun }[] = [
  { value: "system", label: "System", icon: IconMonitor },
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
];

/**
 * §20.8/§22.8 — the freelancer's Preferences: the stored timezone that drives
 * dashboard/calendar/invoice date rendering, and the dark-mode override
 * (system defers to prefers-color-scheme, light/dark pin the ladder).
 * Theme changes apply instantly via Shell's data-theme effect; timezone flows
 * through lib/format.ts activeTimezone.
 */
export function PreferencesSection() {
  const { push } = useToasts();
  const myUser = useQuery(api.users.myUser);
  const updateTheme = useMutation(api.users.updateThemePreference);
  const updateTimezone = useMutation(api.users.updateTimezone);

  // Draft state so the theme applies on click, and timezone on explicit Save.
  const [timezoneDraft, setTimezoneDraft] = useState<string | null>(null);

  const theme: ThemePreference = myUser?.themePreference ?? "dark";
  const timezone = timezoneDraft ?? myUser?.timezone ?? defaultTimezone();

  const doTheme = async (next: ThemePreference) => {
    try {
      await updateTheme({ themePreference: next });
    } catch {
      push({ message: "Could not update theme." });
    }
  };

  const doSaveTimezone = async () => {
    try {
      await updateTimezone({ timezone });
      setTimezoneDraft(null);
      push({ message: `Timezone set to ${timezone}` });
    } catch {
      push({ message: "Could not update timezone." });
    }
  };

  return (
    <SettingsSection
      title="Preferences"
      description="Your timezone drives how dates render across the dashboard, calendar, and invoices (§20.8). Theme controls the dark-first surface (§22.8)."
    >
      <div className="field">
        <label>Theme</label>
        <div className="pref-theme-row" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              className={`chip${theme === value ? " chip-active" : ""}`}
              onClick={() => void doTheme(value)}
            >
              <Icon width={16} height={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="pref-tz">Timezone</label>
        <div className="pref-tz-row">
          <select
            id="pref-tz"
            className="input"
            value={timezone}
            onChange={(e) => setTimezoneDraft(e.target.value)}
          >
            {TIMEZONE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void doSaveTimezone()}
            disabled={timezoneDraft === null}
          >
            Save
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
