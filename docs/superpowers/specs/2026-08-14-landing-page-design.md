# Signal — Marketing/Landing Page design ("Entropy → Signal")

Date: 2026-08-14. Status: approved (awaiting implementation plan).

This is the design for the **marketing/landing page** for Signal, the solo-freelancer CRM. It is a separate build from the product SPA, sharing its design language and — per the approved splice approach — its actual presentational components.

---

## 0. Scope & relationship to the product

- A separate Astro build and deploy target (Cloudflare Pages) from the product Vite SPA.
- Shares Signal's visual language (color, elevation, squircle shape, motion curve, the signal-bar mark) as defined in `signal-design.md` §1.
- **Not** governed by the product's §23 HCI/behavioral rules (confirm-first, undo-as-default) — those are rules for a tool handling real client money, not a marketing site.
- The page is louder in structure and motion than the product, in exactly one place (the hero); everywhere else it is the same hand at a calmer register.

## 1. Narrative arc (locked, from brief)

One loud, unforgettable moment — then calm, confident execution that proves the calm is earned. Not "wild" sustained top to bottom. The chaos→order hero is a release of tension; every section after it carries the same visual language at a different register, deliberately demonstrating that the opening chaos was worth resolving into this. No second big-loud-moment competing with the hero. The signal-bar motif and the scrub-driven-transform technique recur later (smaller, calmer) rather than being a one-off trick.

## 2. Technical foundation (locked, from brief)

- **Astro** shell, islands architecture. Static HTML/CSS by default; React hydrates only interactive pieces (`client:visible`/`client:idle`). Copy-heavy sections stay zero-JS static.
- **GSAP + ScrollTrigger, scroll-scrubbed** (`scrub`), not a physics engine. Every settling/transform effect is baked-in randomized start values interpolating to identity values, scroll position as the timeline's playhead — fully reversible on scroll-up.
- **`useGSAP`** (`@gsap/react`), imperative refs — animation state never touches React `setState`/`useState`.
- **Lenis** for smooth scroll, integrated with ScrollTrigger.
- **Plain 2D canvas** for the cursor signal-trail — separate decoupled layer.
- **Hand-rolled typewriter**, not `xterm.js`, for the terminal moment.
- **Squircle corners require two-layer structure** (found by prototyping, not guessed): outer wrapper carries box-shadow/elevation (with approximate radius matching the squircle's visual size), inner element carries the true squircle `clip-path` (superellipse n≈5, generated once as an SVG `clipPath` with `clipPathUnits="objectBoundingBox"`, reused via `url(#squircle)`). A single-div squircle silently loses either its shape or its elevation.
- **Fallback and performance gate built and tested FIRST**: `prefers-reduced-motion` path + a device/connection-speed gate; a working simplified crossfade version (same "chaos becomes order" beat, no scrub physics) in place early. Test on real mid-range hardware and Safari iOS, not DevTools throttling alone.
- **Settling motion is eased interpolation** (power/custom cubic-bezier), not a spring/physics library; hand-tuned against real scroll input on a real device. Budget real device-testing time.

## 3. Approved architectural decisions (from Q&A)

### 3.1 Monorepo (full shared workspace) — DEVIATION from brief

The brief's "own repo, not part of the Vite SPA" is overridden by the approved full shared monorepo: **one git repo, two deploy targets**. The product is restructured into a `pnpm` workspace:

```
signal-crm/                            ← monorepo root (the git repo)
├── pnpm-workspace.yaml
├── package.json                       (root scripts: build/test/lint/typecheck)
├── apps/
│   ├── signal-crm/                    ← the existing product, moved intact
│   └── signal-site/                   ← Astro landing page (main deliverable)
│       ├── astro.config.mjs           (Cloudflare adapter)
│       ├── src/pages/index.astro
│       ├── src/components/            (React islands)
│       ├── src/data/                  (typed, clearly-illustrative seed data)
│       └── src/functions/pulse.ts     (Cloudflare Pages Function — real-events seam)
└── packages/
    └── signal-ui/                     ← shared presentational layer
        ├── src/tokens.css             (the v3 token ladder, BOTH modes; site renders dark only)
        ├── src/Icons.tsx              (20px/1.5px/miter register)
        ├── src/SignalBar.tsx          (brand mark — hero + footer + favicon)
        ├── src/StatusChip.tsx         (dot register: filled/outline/dimmed + monochrome text)
        ├── src/CalendarGrid.tsx       (42-cell month grid, chip kinds)
        ├── src/PalettePanel.tsx       (command palette rows + keyboard nav, prop-fed)
        └── src/ClientDetailShell.tsx  (detail-head, stats-strip, timeline rows)
```

### 3.2 The splice contract — "extract-on-need"

Extract **only** the presentational pieces the landing demo needs (tokens, Icons, SignalBar, StatusChip, CalendarGrid, PalettePanel, ClientDetailShell) into `signal-ui`. Every extracted component becomes **prop-driven** (data in, callbacks out; no Convex hooks, no `useTheme`, no router). The product starts importing the same files — look stays byte-identical. Extraction is proven by the product's own 140 Vitest + build + oxlint + tsc staying green, plus a visual pass. Un-extracted product components stay in the app and migrate later only if needed.

The site never touches Convex: demo components are fed typed seed objects that satisfy the same prop contracts the product's own queries satisfy.

### 3.3 Deploy

Cloudflare Pages with the native Astro adapter. The product's deploy is unchanged. `PUBLIC_APP_URL` is the single injected value for the "Open Signal" CTA (one config module, marked as the spot to set at deploy; never a hardcoded fake).

### 3.4 Theme

Dark-only, always dark (the product's dark ladder, `#08090a` floor). One contrast matrix, the hero hits hardest on dark.

### 3.5 Live data pulse — static now + function seam

At launch: clearly-labeled illustrative events with a visible marker. A Cloudflare Pages Function (`src/functions/pulse.ts`) with an env-gated data source serves whatever exists; with no source configured it returns the illustrative set. When real anonymized events exist, the same function + same component render them with zero re-architecture. **Never fabricated live data.**

### 3.6 Pricing — prose-only, no figures

Per brief's "no fabricated statistics," and the approved choice: **no line-item table, no dollar amounts**. Plain sentences on what it costs to run and where a donation goes. The section's spectacle is the honesty, not numbers that could be wrong.

### 3.7 CTA destination

Primary CTA is the app sign-up page, via `PUBLIC_APP_URL`. The app has no public URL yet; the config constant is the single clearly-marked spot to set at launch.

## 4. Page structure (section-by-section)

```
┌─ Topbar (fixed, flat elevation-1) ──────────────┐  signal-bar mark · anchors
│  Features  Demo  Pricing  [Open Signal]         │  + sound toggle (opt-in)
└──────────────────────────────────────────────────┘
1. HERO "Entropy → Signal"          chaos → order, scroll-scrubbed. (island)
2. Features scrollytelling          PR merge → timeline event → invoice line. (island)
3. Live product demo                real signal-ui components, prop-fed. (island, pinned)
4. Interactive terminal             `signal import github.com/you/repo` typewriter. (island)
5. Live data pulse                  waveform pulses, illustrative-until-real. (island)
6. Pricing — "free forever"         prose-only, calm. (static, zero JS)
7. Footer / CTA bookend             signal-bar pulse once more. (tiny island)
```

**Hero** — ~16 real DOM elements representing the freelancer's mess (spreadsheet screenshot, sticky note, half-finished invoice, Slack DM, GitHub tab, missed-follow-up notice), scattered and randomly rotated, reading as genuine clutter. Scroll resolves each into the product's design system: squircle corners form, elevation replaces overlap, monochrome tokens take over. Each element gets its own staggered scroll range. Cursor signal-trail (2D canvas): thin waveform, jittery over unsettled areas, snapping calm as scroll progress resolves that portion — tracks actual scrub progress, not a fixed zone. Optional sound (off by default): one restrained "signal ping" at the exact moment the last element resolves.

**Features scrollytelling** — small mock PR panel; as the user scrolls, the PR merge becomes a timeline event, then becomes an invoice line item — one continuous transformation, calmer than the hero, same scrub technique.

**Live product demo** — real `signal-ui` components (ClientDetailShell + stats-strip, CalendarGrid, PalettePanel, StatusChip) assemble and respond as the user scrolls, fed from `src/data/` seed objects.

**Terminal** — hand-rolled typewriter (not xterm.js). Real focus handling; typing `signal import github.com/you/repo` + Enter triggers a scripted, timed response populating a mini timeline preview. Keyboard/screen-reader path: a "skip/complete sequence" action jumps straight to the full response. Not a hover trick.

**Live data pulse** — ambient waveform pulses; illustrative-until-real (see 3.5).

**Pricing** — prose-only "free forever, donation-funded." Calm; boldness is the honesty.

**Footer / CTA bookend** — the signal-bar returns once more: a single calm pulse at the final "Open Signal" CTA, closing the loop the hero opened.

## 5. Visual language on the site

- Type: Inter Variable for headlines/body, Geist Mono for ALL numerals + code/terminal text. Same three-faces-three-jobs rule. Site display type runs 32–72px on the same family/weights (300/400/510/590), `--tracking-display` on 32px+.
- Colors: the exact dark ladder; `--beacon` semantics preserved (primary CTAs, links, focus rings — never decorative fill); status hues dot-only.
- Elevation, squircle two-layer corners, `--ease-signal`, press-scale, focus ring, AA contrast — all inherited from `signal-design.md`. No forked palette; any missing token is flagged, not invented.

## 6. Verification

At each checkpoint: `pnpm build`, `oxlint`, `tsc --noEmit`, `astro check`, plus a small Playwright smoke (full experience + forced reduced-motion) asserting the fallback renders. Real-device budget explicitly allocated for: (1) the settling-motion easing curve, (2) backdrop-filter/glass behavior. If real-device testing shows a section can't hold frame rate on mid-range hardware, that section's fallback becomes its shipped version.

## 7. Build order (from brief, each with a report checkpoint)

1. Performance/fallback gate (crossfade baseline + reduced-motion + low-power gate) — FIRST, before polish
2. Hero (section 4)
3. Footer bookend (validates motif reuse early)
4. Features scrollytelling
5. Live product demo
6. Terminal
7. Live pulse
8. Pricing (calm static section; builds anytime, listed last per brief)

## 8. Flagged deviations from the brief

1. **Monorepo, not separate repo** — "own repo/deploy target" → one git repo, two deploy targets, per the approved full-shared-workspace decision (3.1). `CONTEXT.md` standing rules + phase log get updated.
2. **Pricing figures omitted** — prose-only per approved choice (3.6); brief's "real numbers" honored as honesty-without-fabrication.
3. **Product restructure** — `signal-crm` moves under `apps/`, npm→pnpm workspace, `.github/workflows/lint.yml` and paths updated. Product logic untouched; only the small presentational extraction touches app code.
4. **Git init** — `signal-crm` is not currently a git repo; the monorepo root becomes the repo.

## 9. Non-negotiables (carried from brief)

- No second big loud moment.
- Reduced-motion/low-power fallback built and tested before full polish.
- No fabricated statistics or fake "live" data.
- Sound opt-in, off by default, used exactly once (hero resolution).
- Terminal + all interactive elements keyboard-accessible with a way to skip/complete.
- Squircle = two-layer structure (shadow wrapper + clip-path inner), never single-div.
- Reuse `signal-design.md` tokens; flag rather than fork.
