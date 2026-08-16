import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { initials } from "../lib/format";
import { IconCopy, IconLogOut, IconMonitor, IconMoon, IconSettings, IconSun } from "./Icons";
import { useToasts } from "./ui/useToasts";

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" } as const;
const THEME_ICON = { system: IconMonitor, light: IconSun, dark: IconMoon } as const;

/**
 * Sidebar user card — the avatar is the trigger; hovering it (desktop) or
 * clicking it (touch/keyboard) opens a profile popover with the detail-driven
 * account info: email (copyable), timezone (§20.8 — it drives date rendering),
 * theme, active sessions, and the account actions. The close is delayed so a
 * mouse moving from the trigger into the popover doesn't flicker it shut.
 */
export function UserMenu({
  themePreference,
  onCycleTheme,
}: {
  themePreference: "system" | "light" | "dark";
  onCycleTheme: () => void;
}) {
  const { signOut } = useAuthActions();
  const myUser = useQuery(api.users.myUser);
  const sessions = useQuery(api.sessions.mySessions);
  const { push } = useToasts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  // Whether the popover was opened by keyboard/click (not hover) — only then
  // does close restore focus to the trigger. A hover-open/close never had
  // focus on the trigger, so refocusing would yank the user's cursor away.
  const openedByFocus = useRef(false);

  const name = myUser?.name ?? "Account";
  const email = myUser?.email ?? null;
  const timezone = myUser?.timezone ?? "UTC";

  // Outside click + Esc close; mousedown so a click that opens doesn't
  // immediately close (the trigger is inside ref). Restores focus to the
  // trigger when the popover was opened by keyboard/click and then closed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (openedByFocus.current) triggerRef.current?.focus();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        if (openedByFocus.current) triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };
  const toggle = () => {
    cancelClose();
    openedByFocus.current = true;
    setOpen((o) => !o);
  };

  const ThemeIcon = THEME_ICON[themePreference];

  return (
    <div
      ref={ref}
      className="user-menu"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        className="user-trigger"
        aria-label={`Account: ${name}. Open profile.`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="user-trigger-text">
          <span className="user-name">{name}</span>
          <span className="user-email num">{email ?? "No email"}</span>
        </span>
      </button>

      {open && (
        <div className="user-popover" role="dialog" aria-label="Account">
          <div className="user-pop-inner">
            <div className="user-pop-head">
              <span className="avatar avatar-lg" aria-hidden="true">
                {initials(name)}
              </span>
              <div className="user-pop-id">
                <span className="user-name">{name}</span>
                <span className="user-email num">{email ?? "No email"}</span>
              </div>
              {email && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Copy email"
                  title="Copy email"
                  onClick={() => {
                    void navigator.clipboard.writeText(email).then(() => {
                      push({ message: "Email copied" });
                    });
                  }}
                >
                  <IconCopy width={14} height={14} />
                </button>
              )}
            </div>

            <dl className="user-pop-facts">
              <div className="user-fact">
                <dt>Timezone</dt>
                <dd className="num">{timezone}</dd>
              </div>
              <div className="user-fact">
                <dt>Theme</dt>
                <dd>
                  <button type="button" className="fact-action" onClick={onCycleTheme}>
                    <ThemeIcon style={{ width: 12, height: 12 }} />
                    {THEME_LABEL[themePreference]}
                  </button>
                </dd>
              </div>
              <div className="user-fact">
                <dt>Sessions</dt>
                <dd className="num">{sessions === undefined ? "…" : sessions.length}</dd>
              </div>
            </dl>

            <div className="user-pop-actions">
              <NavLink to="/settings" className="btn btn-ghost" onClick={() => setOpen(false)}>
                <IconSettings style={{ width: 14, height: 14 }} />
                Settings
              </NavLink>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                <IconLogOut style={{ width: 14, height: 14 }} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
