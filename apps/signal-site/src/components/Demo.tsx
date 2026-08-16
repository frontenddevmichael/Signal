import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SignalBarPath } from "signal-ui/SignalBar";
import { Icon, type IconName } from "signal-ui/Icons";
import { CalendarGrid } from "signal-ui/CalendarGrid";
import type { CalendarEvent } from "signal-ui/calendar";
import { ClientDetailShell, type ShellTimelineRow } from "signal-ui/ClientDetailShell";
import type { ShellStat } from "signal-ui/ClientDetailShell";
import { PalettePanel, type PaletteGroup, type PaletteItem } from "signal-ui/PalettePanel";
import { motionMode } from "../lib/motionGate";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Demo — the live product demo (brief §3.3, §6.2, §6.3).
   Real signal-ui components (client detail, command palette,
   calendar) assemble inside a product window, piece by piece,
   as the user scrolls — topbar first (mark stroke-DRAWN), then
   sidebar, then detail, rows staggering in — then the demo
   STAYS assembled for the rest of the pin and is genuinely
   interactive: the palette filters and switches clients, the
   calendar navigates months, tabs and rows have real
   hover/focus/press states. Animation state lives in GSAP;
   interaction state lives in React (never the reverse).
   ============================================================ */

type ClientId = "acme" | "nimbus" | "meridian";

interface ClientSeed {
  name: string;
  company: string;
  statusLabel: string;
  stats: ShellStat[];
  timeline: ShellTimelineRow[];
}

const CLIENTS: Record<ClientId, ClientSeed> = {
  acme: {
    name: "Acme Co.",
    company: "design systems",
    statusLabel: "Active",
    stats: [
      { label: "Total billed", value: "$42,180" },
      { label: "Open invoices", value: "3" },
      { label: "Last contact", value: "2h ago" },
      { label: "Active projects", value: "9" },
    ],
    timeline: [
      { id: "t1", icon: "branch", label: "PR #42 merged", time: "2h" },
      { id: "t2", icon: "invoice", label: "Invoice INV-2026-0001 sent", time: "yesterday" },
      { id: "t3", icon: "check", label: "Follow-up completed", time: "3d" },
    ],
  },
  nimbus: {
    name: "Nimbus",
    company: "cloud infra",
    statusLabel: "Active",
    stats: [
      { label: "Total billed", value: "$18,900" },
      { label: "Open invoices", value: "1" },
      { label: "Last contact", value: "4d ago" },
      { label: "Active projects", value: "4" },
    ],
    timeline: [
      { id: "t1", icon: "sticky", label: "Note added", time: "1d" },
      { id: "t2", icon: "check", label: "Invoice INV-2026-0002 paid", time: "yesterday" },
      { id: "t3", icon: "repo", label: "Repo connected", time: "5d" },
    ],
  },
  meridian: {
    name: "Meridian",
    company: "fintech",
    statusLabel: "Active",
    stats: [
      { label: "Total billed", value: "$96,340" },
      { label: "Open invoices", value: "5" },
      { label: "Last contact", value: "40m ago" },
      { label: "Active projects", value: "12" },
    ],
    timeline: [
      { id: "t1", icon: "branch", label: "PR #128 merged", time: "40m" },
      { id: "t2", icon: "calendar", label: "Meeting with Ana", time: "2h" },
      { id: "t3", icon: "invoice", label: "Invoice INV-2026-0003 sent", time: "1d" },
    ],
  },
};

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: "actions",
    label: "Actions",
    items: [
      { id: "a-new-contact", label: "New contact", sub: "⌘N", icon: "plus" },
      { id: "a-new-invoice", label: "New invoice", sub: "N", icon: "invoice" },
      { id: "a-calendar", label: "Open calendar", sub: "C", icon: "calendar" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    items: [
      { id: "acme", label: "Acme Co.", sub: "design systems", icon: "repo" },
      { id: "nimbus", label: "Nimbus", sub: "cloud infra", icon: "repo" },
      { id: "meridian", label: "Meridian", sub: "fintech", icon: "repo" },
    ],
  },
  {
    id: "invoices",
    label: "Invoices",
    items: [
      { id: "inv1", label: "INV-2026-0001 — Acme Co.", sub: "$1,250.00", icon: "invoice" },
      { id: "inv2", label: "INV-2026-0002 — Nimbus", sub: "$840.00", icon: "invoice" },
    ],
  },
];

function seedEvents(year: number, month: number): CalendarEvent[] {
  const at = (day: number) => new Date(year, month, day, 10, 0, 0).getTime();
  const d = new Date(year, month, 1);
  const base = [
    { id: "e1", kind: "deadline", title: "Design system v2", subtitle: "Acme Co. · due", at: at(18), status: "upcoming" },
    { id: "e2", kind: "invoice", title: "INV-2026-0001", subtitle: "Acme Co. · due", at: at(12), status: "partial" },
    { id: "e3", kind: "followup", title: "Follow up — Nimbus", subtitle: "pending", at: at(9), status: "upcoming" },
    { id: "e4", kind: "deadline", title: "Auth overhaul", subtitle: "Meridian · due", at: at(24), status: "upcoming" },
  ] as CalendarEvent[];
  // one overdue event on day 6 to exercise the critical register
  base.push({ id: "e5", kind: "invoice", title: "INV-2026-0000", subtitle: "Acme Co. · overdue", at: at(6), status: "overdue" });
  return base.filter((e) => new Date(e.at).getMonth() === d.getMonth());
}

const SIDEBAR: { id: string; icon: IconName; label: string; active?: boolean }[] = [
  { id: "clients", icon: "repo", label: "Clients", active: true },
  { id: "invoices", icon: "invoice", label: "Invoices" },
  { id: "calendar", icon: "calendar", label: "Calendar" },
  { id: "inbox", icon: "mail", label: "Inbox" },
];

export default function Demo() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGSVGElement>(null);
  const resizeTimer = useRef<number | undefined>(undefined);

  // Interaction state (never animation state).
  const [clientId, setClientId] = useState<ClientId>("acme");
  const [calCursor, setCalCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [calFlash, setCalFlash] = useState(false);

  const client = CLIENTS[clientId];

  useGSAP(
    () => {
      const section = sectionRef.current;
      const win = winRef.current;
      const mark = markRef.current?.querySelector<SVGPathElement>("path") ?? null;
      if (!section || !win || !mark) return;
      const mode = motionMode();
      if (import.meta.env.DEV) document.body.dataset.demoEffect = mode;

      const buildTl = (tl: gsap.core.Timeline) => {
        const q = (sel: string) => section.querySelector<HTMLElement>(sel);
        const title = q("[data-demo-title]");
        const sidebarRows = section.querySelectorAll<HTMLElement>("[data-sidebar]");
        const head = q("[data-head]");
        const stats = section.querySelectorAll<HTMLElement>("[data-head] .cds-stat");
        const tabs = q("[data-head] .cds-tabs");
        const tlRows = section.querySelectorAll<HTMLElement>("[data-head] .cds-tl-row");
        const cal = q("[data-cal]");
        const palette = q("[data-palette]");
        const caption = q("[data-caption]");

        if (title) tl.fromTo(title, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0);
        tl.fromTo(
          win,
          { opacity: 0, scale: 0.96, y: 14 },
          { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "power2.out" },
          0.08
        );
        // Mark stroke-DRAW (brief §6.2 — being drawn, not just fading).
        tl.fromTo(
          mark,
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.3, ease: "power1.inOut" },
          0.14
        );
        sidebarRows.forEach((row, i) => {
          tl.fromTo(
            row,
            { opacity: 0, x: -10, pointerEvents: "none" },
            { opacity: 1, x: 0, pointerEvents: "auto", duration: 0.3, ease: "power2.out" },
            0.22 + i * 0.06
          );
        });
        if (head) tl.fromTo(head, { opacity: 0, y: 12, pointerEvents: "none" }, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.35, ease: "power2.out" }, 0.34);
        stats.forEach((s, i) => {
          tl.fromTo(s, { opacity: 0, y: 10, pointerEvents: "none" }, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.3, ease: "power2.out" }, 0.46 + i * 0.05);
        });
        if (tabs) tl.fromTo(tabs, { opacity: 0, y: 8, pointerEvents: "none" }, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.25, ease: "power2.out" }, 0.6);
        tlRows.forEach((row, i) => {
          tl.fromTo(row, { opacity: 0, y: 10, pointerEvents: "none" }, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.3, ease: "power2.out" }, 0.68 + i * 0.08);
        });
        if (cal) tl.fromTo(cal, { opacity: 0, y: 16, pointerEvents: "none" }, { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.4, ease: "power2.out" }, 0.9);
        if (palette) tl.fromTo(palette, { opacity: 0, y: 12, scale: 0.95, pointerEvents: "none" }, { opacity: 1, y: 0, scale: 1, pointerEvents: "auto", duration: 0.35, ease: "power2.out" }, 1.08);
        if (caption) tl.fromTo(caption, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 1.35);
      };

      if (mode === "simple") {
        section.classList.add("is-simple");
        const tl = gsap.timeline({ delay: 0.35 });
        buildTl(tl);
        tl.play();
        return () => section.classList.remove("is-simple");
      }

      const tl = gsap.timeline({
        scrollTrigger: { trigger: section, start: "top top", end: "bottom bottom", scrub: 1 },
      });
      buildTl(tl);
      if (import.meta.env.DEV) {
        (window as unknown as { __demoTl: gsap.core.Timeline }).__demoTl = tl;
      }
      const refresh = () => ScrollTrigger.refresh();
      document.fonts?.ready.then(refresh).catch(() => {});
      window.addEventListener("load", refresh, { once: true });

      const onResize = () => {
        window.clearTimeout(resizeTimer.current);
        resizeTimer.current = window.setTimeout(() => ScrollTrigger.refresh(), 200);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    },
    { scope: sectionRef, dependencies: [] }
  );

  const onPaletteSelect = (item: PaletteItem, group: PaletteGroup) => {
    if (group.id === "clients" && item.id in CLIENTS) {
      setClientId(item.id as ClientId);
      return;
    }
    if (item.id === "a-calendar") {
      setCalFlash(true);
      window.setTimeout(() => setCalFlash(false), 1400);
    }
  };

  return (
    <section ref={sectionRef} className="demo-section" id="demo" aria-label="Live product demo">
      <div ref={stageRef} className="demo-stage">
        <div className="demo-title" data-demo-title>
          <p className="section-kicker">Demo</p>
          <h2 className="section-title">Watch it run.</h2>
          <p className="display-sub">The actual Signal client detail, palette, and calendar — real components, live.</p>
        </div>

        <div className="demo-win-wrap">
          <div ref={winRef} className="demo-win">
            {/* Topbar */}
            <div className="demo-topbar">
              <span className="demo-brand">
                <SignalBarPath ref={markRef} size={18} className="mark" style={{ strokeDasharray: 1 }} />
                <span>Signal</span>
              </span>
              <span className="demo-topbar-client">{client.name}</span>
              <span className="beacon-dot" aria-hidden="true" />
            </div>

            <div className="demo-body">
              {/* Sidebar */}
              <nav className="demo-sidebar" aria-label="Demo navigation">
                {SIDEBAR.map((s) => (
                  <span key={s.id} data-sidebar className={`demo-nav-row${s.active ? " is-active" : ""}`}>
                    <Icon name={s.icon} label={s.label} size={14} />
                    <span>{s.label}</span>
                  </span>
                ))}
              </nav>

              {/* Main — the client detail (real shared component) */}
              <div className="demo-main">
                <div data-head>
                  <ClientDetailShell
                    name={client.name}
                    company={client.company}
                    statusLabel={client.statusLabel}
                    stats={client.stats}
                    timeline={client.timeline}
                    tabs={[
                      { id: "timeline", label: "Timeline", count: 4 },
                      { id: "projects", label: "Projects", count: 9 },
                      { id: "financials", label: "Financials", count: 3 },
                    ]}
                  />
                </div>
              </div>

              {/* Calendar — real shared component */}
              <div className={`demo-cal${calFlash ? " flash" : ""}`} data-cal>
                <CalendarGrid
                  year={calCursor.year}
                  month={calCursor.month}
                  events={seedEvents(calCursor.year, calCursor.month)}
                  onMonthChange={(y, m) => setCalCursor({ year: y, month: m })}
                  compact
                />
              </div>
            </div>

            {/* Palette — real shared component, floats over the detail. It's a
                persistent part of the composition (not a focus-managed
                overlay), so it renders non-modal: role="search" instead of
                role="dialog", which would mislead screen readers. */}
            <div className="demo-palette" data-palette>
              <PalettePanel groups={PALETTE_GROUPS} onSelect={onPaletteSelect} placeholder="Jump to…" modal={false} />
            </div>
          </div>
        </div>

        <div className="demo-caption" data-caption>
          <Icon name="external" label="" size={14} />
          <span>
            This is the real product UI — type in the palette, switch clients, flip the calendar. <strong>It's live.</strong>
          </span>
        </div>
      </div>
    </section>
  );
}
