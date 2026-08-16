/**
 * §20.8 — the settings timezone selector. A curated IANA list grouped by
 * region (not every zone — the full registry has ~600 entries and mostly
 * duplicates). Africa first: Signal's PRD is written for a solo developer
 * market where Lagos/Accra/Nairobi are the anchors, and the select defaults
 * to the browser's own zone when it's in the list.
 */
export interface TimezoneGroup {
  label: string;
  zones: string[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "Africa",
    zones: [
      "Africa/Abidjan", "Africa/Accra", "Africa/Algiers", "Africa/Cairo",
      "Africa/Casablanca", "Africa/Johannesburg", "Africa/Kampala", "Africa/Lagos",
      "Africa/Nairobi", "Africa/Tunis",
    ],
  },
  {
    label: "Americas",
    zones: [
      "America/Argentina/Buenos_Aires", "America/Bogota", "America/Caracas",
      "America/Chicago", "America/Denver", "America/Halifax", "America/Lima",
      "America/Los_Angeles", "America/Mexico_City", "America/New_York",
      "America/Phoenix", "America/Santiago", "America/Sao_Paulo", "America/Toronto",
      "America/Vancouver",
    ],
  },
  {
    label: "Asia",
    zones: [
      "Asia/Bangkok", "Asia/Dubai", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong",
      "Asia/Jakarta", "Asia/Jerusalem", "Asia/Karachi", "Asia/Kolkata",
      "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Riyadh", "Asia/Seoul",
      "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei", "Asia/Tehran", "Asia/Tokyo",
    ],
  },
  {
    label: "Europe",
    zones: [
      "Europe/Amsterdam", "Europe/Berlin", "Europe/Brussels", "Europe/Dublin",
      "Europe/Istanbul", "Europe/Lisbon", "Europe/London", "Europe/Madrid",
      "Europe/Moscow", "Europe/Paris", "Europe/Rome", "Europe/Stockholm", "Europe/Vienna",
    ],
  },
  {
    label: "Oceania",
    zones: [
      "Australia/Brisbane", "Australia/Melbourne", "Australia/Perth",
      "Australia/Sydney", "Pacific/Auckland", "Pacific/Honolulu",
    ],
  },
  {
    label: "UTC",
    zones: ["UTC"],
  },
];

/** Flat list of every zone in the selector. */
export const ALL_TIMEZONES: string[] = TIMEZONE_GROUPS.flatMap((g) => g.zones);

/**
 * Default selection: the browser's own zone when it's in the list, else UTC —
 * so the select opens on the user's real zone without them hunting.
 */
export function defaultTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ALL_TIMEZONES.includes(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}
