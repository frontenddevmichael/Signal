# Signal — Design System & UI/UX Reference

**Read this in full before writing any frontend code — a new component, a new screen, or an edit to an existing one.** This file is the single source of truth for how Signal looks and behaves. It's extracted from the PRD (Sections 22–23) so it can be checked quickly without re-reading the whole spec, but the PRD is still the canonical source if anything here seems out of sync — flag that rather than guessing.

If a task doesn't specify visual details, don't invent them freehand — come back to this file first. Consistency across 100+ screens matters more than any individual screen's cleverness.

---

## 0. The five-second version

Warm-neutral monochrome, one reserved black accent used only for things needing attention, three typefaces each with exactly one job, an elevation ladder that lifts surfaces off a flat floor (shell stays flat — never glass), glass reserved for exactly the flying surfaces (modals, palettes, popovers), squircle corners, one motion system, quiet confident microcopy, and a bias toward confirming before destructive actions rather than cleaning up after them. Nothing performs friendliness. Nothing is decorative for its own sake — every recurring visual device (the Beacon) exists because it maps to something real in the product (Section 3's follow-up nudge).

---

## 1. Design tokens

### 1.1 Color

```css
--canvas-light: #f3f2f0;
--canvas-dark: #08090a;

/* warm gray scale — text, borders, flat surfaces */
--text-primary / --text-secondary / --text-tertiary
/* tertiary passes 4.5:1 on EVERY resting surface in both modes —
   dark #878a8f, light #6d6e70 (deviation from the literal hex below,
   the spec's own AA rule wins, see §4) */

--beacon: #1E1E1E; /* near-black — the ONE accent, monochrome in dark mode */

--status-paid:     #6E8B6E;  /* muted sage  */
--status-overdue:  #B2604A;  /* muted rust  */
--status-pending:  #B08948;  /* muted gold  */
--status-void:     #8A8880;  /* muted stone — deliberately flat/inert */
```

**Rule: `--beacon` is reserved exclusively for things needing the freelancer's attention or action** — primary buttons, focus rings, links, the Beacon motif itself (Section 6 below). Never used decoratively, never as a background fill for a large area, never just "because it's the brand color and this screen needs some color." If you're reaching for `--beacon` and the element doesn't need action or attention, use an ink shade instead. In v3 the beacon renders as a monochrome contrast ramp (`--beacon: var(--text-primary)` = white-on-dark primary actions); the `#1E1E1E` value is its semantic source.

Status colors are deliberately desaturated — they're informational, not alarms. Don't brighten them for "visibility"; the muted tone is the point. **v3 status rule:** hue reinforces, never alone — the monochrome intensity register (`--status-positive/warning/critical/inert`) stays the load-bearing signal and shape/weight carry the meaning; the muted hues above (`.hue` tokens) are paired on top for reinforcement.

**The dot register (Phase D).** Every `.status` chip leads with a small dot whose **shape** encodes the state family — filled = resolved/attention-worthy, outlined = in-flight, dimmed-outline = terminal/off. Text tone + weight stay on the monochrome register (overdue is 590 + brightest; the in-flight family sits below 590 so overdue is unmistakable). Hue is applied to the **dot only**, never to text:

| dot | meaning | hue |
|---|---|---|
| filled | resolved / connected / paid / active | sage (`--status-positive-hue`) |
| filled + 590 | overdue / attention | rust (`--status-critical-hue`) |
| outline | in-flight: draft/sent/viewed/partial/lead/pending | gold (`--status-warning-hue`) |
| dimmed outline | terminal: void/refunded/closed/muted | stone (`--status-inert-hue`) |

AA pairing is checked per surface (Phase D, measured): every hue passes 3:1 as a graphical dot on ALL resting surfaces in both modes (dark worst case rust 3.91:1 on surface-3; light worst case stone 3.17:1 on surface-0 — still ≥3:1 for non-text). Text never takes a hue — the 4.5:1 monochrome register carries it. The same dot register drives the calendar/deadline urgency cues: overdue = filled rust dot + 590, partial = outlined gold dot + 510, upcoming = quiet. A deadline landing within 7 days is warning register (510 + mid tone) — never the critical 590/bright tone, which is reserved for genuinely overdue states.

### 1.2 Typography

| Face | Job | Never used for |
|---|---|---|
| **Inter** | UI, body text, labels, navigation | Numerals in financial/precision contexts |
| **Geist Mono** | ALL numerals — money, dates, invoice numbers, commit hashes, tabular figures | Body prose, headlines |
| **Instrument Sans** | Retired in v3. Headlines now use Inter with `--tracking-display` | — |

If you're rendering a number — an invoice total, an amount_paid, a date, an invoice_number — it's Geist Mono, full stop, regardless of where on the page it appears. This is non-negotiable, not a style suggestion: financial precision has a visual signature in this product, and mixing fonts for numbers breaks it.

### 1.3 Elevation (v3)

Depth signal is a **ladder, not borders**: containers that used to lean on a 1px hairline edge now step off the floor with a shadow. Hairlines remain only where two flat surfaces meet (table row dividers, inset fixtures) — they are separators, not elevation.

```css
--elev-1: /* L1 — flat shell (sidebar/topbar/tabbar) + resting cards */
--elev-2: /* L2 — floating: popovers, dropdowns, toasts, palette input */
--elev-3: /* L3 — modals/sheets, the deepest single surface */
/* shell also uses directional L1 mirrors so the shadow points out of the
   shell, not onto it:
   --elev-1-right: the sidebar's right edge (content-side divider)
   --elev-1-up:    upward mirror for the mobile tabbar's top edge */
```

- The shell (sidebar, topbar, mobile tabbar) is **flat elevation-1, never glass** — locked. A flat surface steps off L0 by surface value + a barely-there L1 shadow that substitutes the old hairline edge (the sidebar's shadow points right, the tabbar's points up).
- The nav rail staggers in on mount: items rise through the `--stagger-*` scale (40/60/80ms) on a transform-only entrance (`nav-in`), `animation-fill-mode: backwards` so the finished animation releases `transform` and never blocks hover/press scale.
- Only L2/L3 floating surfaces may use glass (1.4).
- No neon, no glow, no gradients, no scan-lines — ever. Shadows are soft and typographic.

### 1.4 Glass

Restricted to **Level-2/3 floating surfaces only**: command palette, modals/sheets, popovers, toasts. Never on the shell, never on table rows, list cards, or any data-dense content — those stay flat on the elevation ladder.

**Hard rule: text never sits directly on a glass surface.** Any text inside a glass panel gets a solid inner surface card underneath it. Blur is purely atmospheric, never load-bearing for legibility. If you're about to place a label or paragraph directly on a blurred background, stop and add the inner card first.

**Implementation (Phase E):** glass is a *shell*, never a payload. Each L2/L3 panel is a thin frosted frame (`--glass-bg` + `--glass-border` + `backdrop-filter: blur(var(--glass-blur))`, with the `-webkit-` prefix alongside) carrying a solid content card inside it — the modal hosts `.modal-inner`, the palette hosts `.palette-panel`, the user popover hosts `.user-pop-inner`, the quick-create menu hosts `.quick-menu-inner`. All text, controls, and rows live on that solid card (`--surface-4`), so legibility never depends on the blur. The glass shows only as a ~8px rim and the panel's own border, which is what sells the depth.

- Independent per mode: dark `rgba(24, 25, 26, 0.72)` / `rgba(247, 248, 248, 0.08)`, light `rgba(255, 255, 255, 0.72)` / `rgba(26, 27, 29, 0.09)`, both blur 18px.
- Entrances are scale + opacity (`.modal-in`, `.pop-in`); toasts slide.
- **Deviation flagged:** toasts stay solid `--surface-4` (they're a single line of text with no inner card to carry — wrapping one would be absurd). The frosted-shell pattern applies to *panel* chrome, not to a one-line transient.

```css
--glass-bg: rgba(24, 25, 26, 0.72);          /* dark; independent per mode */
--glass-border: rgba(247, 248, 248, 0.08);
--glass-blur: 18px;
/* light mode: rgba(255, 255, 255, 0.72) / rgba(26, 27, 29, 0.09) */
```

### 1.5 Corners & motion (v3)

**Corners are squircles** (continuous superellipse, `superellipse(2)`), not circular arcs. Native `corner-shape: squircle` is Chromium-only today (Chrome/Edge 139+; ~65% global), so this is implemented as **progressive enhancement**: the radius system renders circular arcs as the baseline everywhere, and a single global `@supports (corner-shape: squircle)` rule upgrades *every box with a non-zero radius* to the continuous curve (zero-radius boxes are untouched). Don't re-declare `corner-shape` per component — the global rule covers it; only reach for it again if a specific geometry needs a different superellipse K.

```css
--radius-xs: 4px;  /* badges, tags, dots */
--radius-sm: 8px;  /* buttons, inputs, controls */
--radius-md: 12px; /* cards, panels, rows */
--radius-lg: 20px; /* modals, large surfaces */

/* motion — ONE easing, one duration band, a stagger scale */
--duration-instant: 120ms;  /* press feedback, hover tint only */
--duration-fast: 200ms;     /* most transitions — the workhorse */
--duration-moderate: 240ms; /* standard state changes */
--duration-panel: 320ms;    /* modals, sheets, palette */

--ease-signal: cubic-bezier(0.32, 0.72, 0, 1); /* the ONE easing curve, used everywhere */

/* sibling entrance stagger: delay each child by one step (40/60/80ms) */
--stagger-sm: 40ms; --stagger-md: 60ms; --stagger-lg: 80ms;
```

`prefers-reduced-motion` is respected from the first component built, not retrofitted at the end. If you're adding a transition, check for this media query in the same commit.

### 1.6 Spacing (v3)

A density-flexible scale — no fixed row heights anywhere. Choose the step, not the number.

```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;
```

### 1.7 The Beacon (signature element)

A small monochrome indicator in `--beacon` (dark: white dot; light: near-black) with a soft pulse. Appears next to anything needing action: an overdue follow-up, an unopened proposal, an overdue invoice, a new message in the general inbox. **Same shape, color, and animation everywhere it appears** — do not create variants of it for different contexts. It's also the basis for the app icon. (The v2 "glass glowing ring" rendering is retired; the pulsing dot remains, in the signal-bar drawing language.)

Before adding a new "needs attention" indicator anywhere in the product, check whether it should just be the Beacon rather than a new pattern.

### 1.8 Responsive breakpoints

```css
--bp-mobile: 640px;
--bp-tablet: 1024px;
/* desktop: 1024px+ */
```

Below 1024px, the sidebar collapses into a bottom tab bar (Home / Clients / Invoices / Inbox) — this is the only mobile nav pattern in the product, don't invent a second one for a specific screen.

### 1.9 Iconography (unchanged from v2)

- 24×24 grid, 1.5px stroke, rounded caps/joins (the current drawing register is the sharper 20px / 1.5px / miter-join set from the v2 rebuild — measured at 20px render, 24px grid).
- Outline is the default style. Filled is reserved only for active/selected states — never use filled icons decoratively.
- Every icon carries an `aria-label`. None are self-explanatory without one (Section 4 below).
- Custom-drawn, one consistent hand — if you're pulling from an icon library, every icon needs to be re-drawn or heavily adapted to this spec, not dropped in as-is from a generic set with a different stroke weight/corner style.

---

## 2. Layout reference

```
┌──────────┬─────────────────────────────────────┐
│          │  ← Acme Co.          ⚬ beacon (health)│
│  Side    │  ─────────────────────────────────── │
│  nav     │  Timeline │ Repos │ Docs │ Financials │
│  (flat L1)│  ─────────────────────────────────── │
│          │                                       │
│  Clients │   ● PR merged        2h ago           │
│  Invoices│   ● Invoice sent     yesterday         │
│  Inbox   │   ● Note added       3d ago            │
│          │   ...flat rows, no glass, elevation   │
│          │   separates, generous vertical rhythm │
└──────────┴─────────────────────────────────────┘
```

Sidebar, top status bar, and the mobile tab bar are **flat elevation-1** surfaces — never glass (v3 lock). Their separation from the canvas is an L1 shadow (`--elev-1-right` for the sidebar, `--elev-1` for the topbar, `--elev-1-up` for the tabbar), not a border. Hairlines inside the shell survive only as dividers between rail sections (nav ↔ footer) — separators, not edges. Only L2/L3 floating surfaces (modals, palette, popovers, toasts) may be glass. The content area always stays flat so dense content never competes with its own container for attention. Use this as the template for every new detail-page-style screen, not just the client detail page it was originally specced for.

**Detail-page type register (v3):** one quiet hierarchy — `.client-name` (primary/510), `.detail-company` + `.meta-label` (secondary, uppercase 12px 510), `.cell-sub` + `.timeline-head time` (secondary/tertiary), `.timeline-label` (primary/510 13px). Timeline glyphs are `--surface-2` discs with `--border-subtle`, icon at `--text-secondary`. Status chips carry state via dot register only (see 1.1); label text stays monochrome. This register is the template for every entity detail screen (client/invoice/project).

---

## 3. Component behavior standards

### 3.0 Interaction language (v3 — one behavior per state, no variants)

- **Pressed** — every interactive element scales down `--scale-press` (0.97) on `:active`, never nudges layout.
- **Hover** — buttons/rows/nav tone-shift their background up one surface step. **Cards only** (`card-hover`) also lift `scale(1.01)`; cards are the only things that scale on hover — scaling a button or row reads as jitter. `card-hover` is opt-in via the class.
- **Focus** — one 2px `--beacon` ring, `outline-offset: 2px`, on every control (both the global `:focus-visible` rule and the scoped interactive rule are beacon; the old `--border-strong` offset-1 variant is deleted). Outline follows radius/corner-shape natively.
- **Disabled** — a contrast FLOOR, not compounding opacity: chrome (borders/icons/bg) dims once at `opacity: 0.6`, text-bearing controls swap to the theme's `--text-disabled` token. Never combine opacity with the token. All disabled elements get `cursor: not-allowed` + `transform: none`.
- **Loading** — three tiers (3.3). Skeleton stacks stagger up the `--stagger-*` scale (40/60/80ms) via a transform-only `skeleton-rise` entrance so it composes with the opacity pulse without a property conflict.

### 3.1 Forms & validation
- States: default → focus (`--beacon` ring) → error (rust-toned border + inline message *below* the field, never a toast) → disabled (reduced opacity, no interaction).
- Validation runs **on blur**, not per keystroke. Don't build real-time-per-character validation even if it seems more responsive — it reads as nagging.
- Required fields: a subtle dot, never a red asterisk. Keeps the monochrome discipline intact even in error states.

### 3.2 Toasts & inline notifications
- Toasts: one-off action confirmations only ("Invoice sent," "Contact merged") — `--beacon`-accented, bottom-right desktop / bottom-center mobile.
- Every reversible action's toast includes an Undo action (see Section 5.2 below for when this applies vs. confirm-first).
- **Ongoing state is never a toast.** Invoice overdue, integration disconnected — these live as a persistent inline indicator on the record itself. A toast disappears; the underlying problem doesn't, so don't represent it with something that vanishes.

### 3.3 Loading states — three tiers, not interchangeable
- **Skeleton screens**: anything data-shaped (tables, timeline, contact list) — gray pulse blocks matching the eventual layout.
- **Inline spinners**: button-level actions (Send Invoice, Save) — small, `--beacon`-colored, inside the button itself.
- **Custom SVG loaders**: full-page/first-load moments ONLY (initial app load, a slow GitHub backfill). Don't reach for a custom illustrated loader on a minor fetch — it dilutes the moments where it should actually earn attention.

### 3.4 Data tables & list rows (v3)
- Column headers sort on click, three-state (asc/desc/none). Header label at `--text-secondary`/510; hover tone-shifts to `--text-primary`.
- Filter bar above the table for status/tags (`.chip` — border `--border-subtle`, 510, press 0.97).
- Infinite scroll, never numbered pagination — Convex's reactive queries make this close to free, and pagination reads as dated for this kind of tool.
- **Container is elevation, not an edge:** `.table-wrap` sits on `--elev-1` (no border). Row separators stay hairline (`--border-subtle`) because they're *dividers between cells*, not edges of the sheet.
- **Row hover** tone-shifts to `--surface-3` (never a hue); selected/active rows use `--surface-3` + `--border-strong`.
- **Entrances:** rows stagger in via `row-in` (opacity-only, `backwards` fill — opacity is deliberately NOT combined with translate so it can't fight the hover tone-shift). List/card collections use `card-rise` (translateY 4px + opacity, 200ms, `backwards`, 40/60/80ms stagger). Every entrance uses `animation-fill-mode: backwards` so the finished animation releases `transform`/`opacity` and hover/press states work again immediately.
- **Stat groups** (client detail `stats-strip`) are asymmetric, not equal: the first metric gets `flex: 1.6` + a larger numeral (26px), the rest are even + quiet (mono 300). The strip itself is `--elev-1`; `--stat + --stat` keep hairline dividers (cell separation, not edge). Below 640px the first stat wraps to full width and the numerals drop to 24px.

### 3.5 Empty vs. error states — deliberately distinct
- **Empty state**: custom SVG + a concrete next action. Nothing's wrong, nothing exists yet. ("No invoices yet — create your first one.")
- **Error state**: flat and quiet. Icon, plain-language explanation, retry action, **no illustration** — it shouldn't visually compete with genuinely bad news by being decorated. A disconnected GitHub integration uses this pattern, "Reconnect" as the primary action.
- Don't use an empty-state illustration for an error condition, even if nothing's rendering either way — the tone difference matters.

### 3.6 Microcopy voice
- Buttons name the exact action: "Send invoice," never "Submit."
- Confirmations echo the button's own word: "Invoice sent," never "Success!"
- Empty states name the next concrete step.
- Errors state what happened and what to do next. Never "Oops!", never exclamation points.
- If you're writing copy and it sounds enthusiastic or cute, rewrite it flatter. The product doesn't perform friendliness — it stays clear. When in doubt, shorter and plainer is more on-voice.

### 3.7 Invoice print/PDF
The in-app invoice view keeps the full design system above. The **client-facing generated PDF uses a completely separate stylesheet**: white background, black text, no glass, no dark mode ever (regardless of the freelancer's own theme setting), Geist Mono for all figures, minimal branding (freelancer's own name/logo only, never Signal's). Don't let the in-app theme leak into PDF generation — these are different documents with different jobs.

---

## 4. Accessibility (non-negotiable floor)

- WCAG AA minimum: 4.5:1 contrast for body text, 3:1 for large text/icons. Check this against both light and dark mode — a token combination that passes in light mode doesn't automatically pass in dark.
- Every interactive element gets a 2px `--beacon`-colored focus-visible ring.
- Keyboard navigation follows logical DOM order: sidebar → tabs → content. Don't let a visually-reordered flex/grid layout scramble tab order — test with keyboard-only navigation, not just visually.
- The glass-text rule (Section 1.4) exists specifically to protect this floor — glass blur is one of the easiest ways to silently fail contrast requirements, so it's a hard rule, not a preference.
- Every icon needs an `aria-label` (Section 1.3) — none of Signal's custom icons are self-explanatory to a screen reader without one.

---

## 5. Interaction & HCI principles — apply these by default, sitewide

These aren't per-feature suggestions. Every new screen follows them without being told to, the same way every screen uses the color tokens without being told to.

### 5.1 Error prevention over error handling
Make mistakes hard to make, don't just handle them gracefully after. Every destructive or hard-to-reverse action (contact merge, account deletion, voiding an invoice, disconnecting an integration, deleting a custom field with live values) gets an explicit confirmation that **names what's about to happen in plain language** — "This will merge Jane Doe into Acme Co. — their timelines and invoices will combine," never a bare "Are you sure?" Genuinely irreversible actions (hard delete on account close) get a harder confirmation than merely-inconvenient-to-undo ones — e.g. typing the name to confirm.

### 5.2 Undo as default, confirm as fallback — choose deliberately, don't mix arbitrarily
- **Reversible actions** → do it immediately, offer Undo via toast (Section 3.2). Faster for the common case, safe for the rare mistake.
- **Irreversible or only-partially-reversible actions** → confirm first, per 5.1.
- Example of the split: a contact merge offers Undo. A hard account deletion does not — it gets upfront confirmation instead.
- **Exception that always wins:** any action that sends money-related communication externally (an invoice, a payment reminder) is **always confirm-first**, never undo-after, regardless of how minor it seems. This overrides the general reversibility rule — the cost of a mistake here is outside the app, not inside it.

### 5.3 Visibility of system status
Nothing that takes longer than ~300ms happens silently. Every async action — sending an invoice, importing a repo, a GitHub backfill running, Gmail forwarding confirmation pending, a WhatsApp message send — shows a specific state at every stage (pending → in progress → success/named failure), using the three-tier loading hierarchy (Section 3.3). Failure states always say what happened and what to do next. This applies with extra force to the multi-step external flows that can sit pending for hours or days (Gmail forwarding confirmation, WhatsApp business verification) — these need a persistent visible status, not just a toast that's already gone by the time the state actually changes.

### 5.4 Consistency of interaction patterns
One pattern per action type, reused everywhere:
- Every "connect an external account" flow (GitHub, Google, WhatsApp) — same shape: settings entry point → provider's own hosted consent screen → redirect back with a visible connected/pending/failed state.
- Every destructive-action confirmation — same modal structure.
- Every list view — same sort/filter/search affordances (Section 3.4).
If you're building a new integration or a new list view, check an existing one first and match its pattern rather than designing fresh.

### 5.5 Recognition over recall
Surface context, don't make the freelancer remember it. Examples already in the product: "Already linked to Acme Co." on repo import, "Also linked to [other client]" on ambiguous invoice line items, a contact's relationship-health indicator visible on the list view (not just buried on the detail page), a disconnected integration's reconnect prompt showing up everywhere its absence would silently break something.

### 5.6 Progressive disclosure
Primary flows (viewing a client, sending an invoice, replying to a message) stay uncluttered. Custom field management, API keys, webhook config, integration scope details — one level removed, in settings. Available and fully functional, just not competing for attention with daily-use screens.

### 5.7 Forgiving input, especially in manual external-dependency flows
The Gmail filter/forwarding setup and WhatsApp business verification are the two flows most likely to have a freelancer lose track of an in-progress step or make a copy-paste error. For these specifically: present setup text as a single copy-button block, not something to retype; re-check confirmation status automatically (poll or re-check on page load) rather than requiring a manual "I did it" click as the only path forward; let these flows resume from wherever they were left off if the freelancer navigates away mid-setup, never force a restart from scratch.

### 5.8 Touch targets & mobile ergonomics
Below 1024px: every interactive element meets a **minimum 44×44px** touch target, even where the visual element itself is smaller — pad a small icon button out to the minimum tappable area rather than shrinking the target to match the icon. Be generous, not minimum-compliant, on anything financial (send invoice, mark paid) — a mis-tap there is worse than a mis-tap on a filter toggle.

### 5.9 Financial actions get the most conservative treatment in the app
No single tap/click ever sends money-related communication without confirm-first (5.2's exception). This is a deliberate trade of slightly more friction on this one class of action, in exchange for speed everywhere else in the product.

---

## 6. Before you build any screen — checklist

1. Does this need a new "needs attention" indicator? → It's probably the Beacon (Section 1.6), not a new pattern.
2. Does this render any number? → Geist Mono, no exceptions.
3. Is this action destructive or hard to reverse? → Confirm-first, plain-language description of consequence (5.1).
4. Is this action reversible and low-stakes? → Do it, offer Undo (5.2) — unless it sends money-related communication, in which case confirm-first anyway.
5. Does this involve an async operation? → Pick the right loading tier (3.3) and make failure states explicit (5.3).
6. Is this a new integration or list view? → Match the existing pattern for that category (5.4), don't invent a new one.
7. Is this a manual, multi-step external flow (like Gmail or WhatsApp setup)? → Copy-button blocks, auto-recheck status, resumable (5.7).
8. Mobile: are all tap targets ≥44px, especially anything financial (5.8)?
9. Contrast check in both light and dark mode (Section 4) — don't assume one implies the other.

If a screen fails more than one of these, stop and fix the pattern before moving to the next screen — inconsistency compounds fast across a 100+-screen product, and it's much cheaper to catch here than in a later polish pass.
