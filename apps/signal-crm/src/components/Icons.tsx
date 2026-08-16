import type { SVGProps } from "react";

/**
 * §1.3 Iconography (v2, Linear register) — 24×24 grid, 1.5px stroke,
 * round caps with SHARP (miter) joins — more geometric, less soft than
 * the old round-cap/round-join spec. Outline default; filled reserved
 * for active/selected/critical status only.
 * Every icon carries an aria-label at the usage site (§23, untouched).
 */
function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconClients(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" />
    </Svg>
  );
}

export function IconInvoices(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </Svg>
  );
}

export function IconInbox(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 14h5l2 3h4l2-3h5" />
    </Svg>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </Svg>
  );
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </Svg>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </Svg>
  );
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Svg>
  );
}

export function IconMonitor(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  );
}

export function IconLogOut(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 8l4 4-4 4M20 12H10" />
    </Svg>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </Svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Svg>
  );
}

/** Filled warning triangle — the §1.6 critical-status shape (never hue). */
export function IconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3l9 16.5H3z" />
      <path d="M12 9.5V14" />
    </Svg>
  );
}

export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function IconCommand(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
    </Svg>
  );
}

export function IconMail(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </Svg>
  );
}

export function IconPhone(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </Svg>
  );
}

export function IconNote(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 4h16v14l-4 2H4z" />
      <path d="M8 9h8M8 13h5" />
    </Svg>
  );
}

export function IconRepo(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M6 8.5v7M8.5 6H14a4 4 0 0 1 4 4v.5M6 15.5V17a4 4 0 0 0 4 4h.5" />
    </Svg>
  );
}

export function IconMoney(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5h.01M18 14.5h.01" />
    </Svg>
  );
}

export function IconGitHub(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </Svg>
  );
}

/** Google's multicolor G — only brand mark in the product (§20.1 sign-in). */
export function IconGoogle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-2.9c-1.1.7-2.5 1.3-4.1 1.3-3.1 0-5.8-2.1-6.7-4.9l-3.9 3C3.5 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.6c-.2-.7-.4-1.5-.4-2.6s.1-1.9.4-2.6l-3.9-3C.4 8.1 0 10 0 12s.4 3.9 1.4 5.6l3.9-3z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.3-3.2C18 1.2 15.2 0 12 0 7.4 0 3.5 2.7 1.4 6.4l3.9 3c.9-2.8 3.6-4.7 6.7-4.7z" />
    </svg>
  );
}
