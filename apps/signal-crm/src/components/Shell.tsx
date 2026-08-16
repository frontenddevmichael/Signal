import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { getDeviceId } from "../lib/device";
import { setActiveTimezone } from "../lib/format";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { CommandPalette, NEW_CONTACT_EVENT, NEW_INVOICE_EVENT } from "./CommandPalette";
import { UserMenu } from "./UserMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  IconBell,
  IconCalendar,
  IconChevronRight,
  IconClients,
  IconCommand,
  IconInbox,
  IconInvoices,
  IconLogOut,
  IconMonitor,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
} from "./Icons";

type ThemePreference = "system" | "light" | "dark";

const THEME_ICONS: Record<ThemePreference, React.ComponentType> = {
  system: IconMonitor,
  light: IconSun,
  dark: IconMoon,
};

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType;
  end?: boolean;
  countKey?: "inbox" | "followups";
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Clients", icon: IconClients, end: true },
      { to: "/invoices", label: "Invoices", icon: IconInvoices },
      { to: "/inbox", label: "Inbox", icon: IconInbox, countKey: "inbox" },
      { to: "/calendar", label: "Calendar", icon: IconCalendar },
      { to: "/followups", label: "Follow-ups", icon: IconBell, countKey: "followups" },
    ],
  },
];

const CYCLE: ThemePreference[] = ["system", "light", "dark"];

const TITLES: Record<string, string> = {
  "/": "Clients",
  "/invoices": "Invoices",
  "/inbox": "Inbox",
  "/calendar": "Calendar",
  "/followups": "Follow-ups",
  "/settings": "Settings",
  "/portal": "Portal",
};

/**
 * §22.7 authenticated shell: surface-1 sidebar + surface-1 topbar with hairline
 * edges (§1.4 — elevation via the surface ladder, glass is gone). Routes render
 * in <Outlet/>. Also records the §18 sessions row per device on auth + focus.
 */
export function Shell() {
  const { signOut } = useAuthActions();
  const myUser = useQuery(api.users.myUser);
  const recordSession = useMutation(api.sessions.recordSession);
  const updateTheme = useMutation(api.users.updateThemePreference);
  const location = useLocation();
  const navigate = useNavigate();

  // v2 design — dark-first default; light is the inverted ladder.
  const themePreference: ThemePreference = myUser?.themePreference ?? "dark";

  // §12 web push — subscribe this browser once signed in (silent if unconfigured).
  usePushSubscription(myUser !== undefined && myUser !== null);

  // §22.8 — resolve system default to an explicit light/dark for the CSS swap.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const resolved = themePreference === "system"
        ? (mq.matches ? "dark" : "light")
        : themePreference;
      document.documentElement.dataset.theme = resolved;
    };
    resolve();
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [themePreference]);

  // §2.5 — ⌘N anywhere (outside an input) opens the new-contact flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && !typing) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(NEW_CONTACT_EVENT));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // §18 sessions — one row per device, lastActiveAt touched on load and focus.
  useEffect(() => {
    if (myUser === undefined || myUser === null) return;
    const touch = () => {
      void recordSession({ deviceId: getDeviceId(), userAgent: navigator.userAgent });
    };
    touch();
    window.addEventListener("focus", touch);
    return () => window.removeEventListener("focus", touch);
  }, [myUser, recordSession]);

  // §20.8 — the freelancer's dashboard renders in their stored timezone.
  useEffect(() => {
    setActiveTimezone(myUser?.timezone ?? null);
  }, [myUser?.timezone]);

  const cycleTheme = async () => {
    const next = CYCLE[(CYCLE.indexOf(themePreference) + 1) % CYCLE.length];
    await updateTheme({ themePreference: next });
  };

  const ThemeIcon = THEME_ICONS[themePreference];
  // §2.7 — one cheap query for the whole chrome (nav badges + overdue chip).
  const counts = useQuery(api.shell.counts);

  const pageTitle =
    TITLES[location.pathname] ||
    (location.pathname.startsWith("/clients/")
      ? "Client"
      : location.pathname.startsWith("/invoices/")
        ? "Invoice"
        : location.pathname.startsWith("/portal")
          ? "Portal"
          : "Not found");

  // Per-route document titles so deep links and shared tabs read correctly.
  useEffect(() => {
    document.title = `${pageTitle} — Signal`;
  }, [pageTitle]);

  // ConnectionState is an object, not a string: isWebSocketConnected is the
  // live socket; hasEverConnected distinguishes first-connect from reconnect.
  const conn = useConvexConnectionState();
  const offline = conn.isWebSocketConnected !== true && conn.hasEverConnected === true;

  // Mobile: no sidebar to navigate back with, so detail pages get a back link.
  const isDetail = location.pathname.startsWith("/clients/") || location.pathname.startsWith("/invoices/");
  const backTo = location.pathname.startsWith("/clients/") ? "/" : "/invoices";

  const nav = (compact: boolean) => (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="nav-section">
          {!compact && <span className="nav-section-label">{section.label}</span>}
          {section.items.map((item) => {
            const count = item.countKey ? (counts?.[item.countKey] ?? 0) : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                aria-label={item.label}
                title={compact ? item.label : undefined}
              >
                <item.icon />
                {!compact && <span>{item.label}</span>}
                {count > 0 && (
                  <span className="nav-count" aria-label={`${count} ${item.label.toLowerCase()}`}>
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          {/* §7 — signal-bar mark, the same drawing as the favicon. */}
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--surface-2)" stroke="var(--border-default)" />
            <path
              d="M10 32h11l5-16 7 32 5-16h16"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={5}
              strokeLinecap="square"
            />
          </svg>
          <span>Signal</span>
          <QuickCreate />
        </div>
        <nav>{nav(false)}</nav>
        <div className="spacer" />

        <div className="sidebar-status" aria-label="Status">
          <span className={`conn-dot${offline ? " offline" : ""}`} aria-hidden="true" />
          <span className="conn-text" role="status">
            {!conn.hasEverConnected ? "Connecting…" : offline ? "Reconnecting…" : "Connected"}
          </span>
          {(counts?.overdue ?? 0) > 0 && (
            <span className="status-chip num" role="status">
              {counts?.overdue} overdue
            </span>
          )}
          {(counts?.dueSoon ?? 0) > 0 && (
            <span className="status-chip num" role="status">
              {counts?.dueSoon} due soon
            </span>
          )}
        </div>

        <div className="sidebar-footer">
          <NavLink to="/settings" className="nav-item" aria-label="Settings">
            <IconSettings />
            <span>Settings</span>
          </NavLink>
          <button type="button" className="nav-item" aria-label="Sign out" onClick={() => void signOut()}>
            <IconLogOut />
            <span>Sign out</span>
          </button>
        </div>

        <UserMenu themePreference={themePreference} onCycleTheme={() => void cycleTheme()} />
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar-title-row">
            {isDetail && (
              <button
                type="button"
                className="back-link icon-btn"
                aria-label="Back"
                onClick={() => navigate(backTo)}
              >
                <IconChevronRight style={{ transform: "rotate(180deg)" }} />
              </button>
            )}
            <div className="title">{pageTitle}</div>
          </div>
          <div className="actions">
            {counts && counts.overdue > 0 && (
              <span className="overdue-chip" role="status">
                {counts.overdue} overdue
              </span>
            )}
            <button
              type="button"
              className="icon-btn palette-trigger"
              aria-label="Command palette (⌘K)"
              title="Command palette"
              onClick={() => window.dispatchEvent(new CustomEvent("signal:toggle-palette"))}
            >
              <IconCommand />
              <kbd className="kbd">⌘K</kbd>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Theme: ${themePreference}. Click to change.`}
              title={`Theme: ${themePreference}`}
              onClick={() => void cycleTheme()}
            >
              <ThemeIcon />
            </button>
          </div>
        </header>

        <main className="main">
          {/* One crashing screen must never blank the app — keyed by route so
              navigation resets a caught error. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* §22.10 — bottom tab bar below 1024px. Settings + Sign out live in
          the sidebar footer on desktop; on touch the sidebar is gone, so
          they get persistent tabbar entries. */}
      <nav className="tabbar" aria-label="Primary">
        {nav(true)}
        <NavLink
          to="/settings"
          end
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          aria-label="Settings"
          title="Settings"
        >
          <IconSettings />
        </NavLink>
        <button type="button" className="nav-item" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
          <IconLogOut />
        </button>
      </nav>

      <CommandPalette />
    </div>
  );
}

/**
 * Quick-create — a "+" in the brand row opening the same create actions the
 * command palette offers, one click from anywhere in the app.
 */
function QuickCreate() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (eventName: string) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(eventName));
  };

  return (
    <div ref={ref} className="quick-create">
      <button
        type="button"
        className="icon-btn quick-add"
        aria-label="Quick create"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconPlus />
      </button>
      {open && (
        <div className="quick-menu" role="menu" aria-label="Quick create">
          <div className="quick-menu-inner">
            <button type="button" className="quick-item" role="menuitem" onClick={() => run(NEW_CONTACT_EVENT)}>
              New contact
              <kbd className="kbd">⌘N</kbd>
            </button>
            <button type="button" className="quick-item" role="menuitem" onClick={() => run(NEW_INVOICE_EVENT)}>
              New invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
