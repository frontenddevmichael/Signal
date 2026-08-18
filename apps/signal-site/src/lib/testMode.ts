/* ============================================================
   testMode — deterministic animation load under Playwright.
   The site's two CONTINUOUS loops (the cursor trail's 60fps
   canvas rAF and Lenis's smooth-scroll ticker) run every frame
   for the page's lifetime. Under automated tests — several pages
   at once against one dev server — that steady main-thread load
   can starve React's event queue (a demo palette fill's onChange
   never commits), which surfaces as flaky specs, not product
   defects. Under a real user the loops are the whole point.
   Playwright marks every page with navigator.webdriver, so a
   real browser never hits this branch. Scroll-scrubbed GSAP
   timelines are NOT gated — they're event-driven (scroll), and
   native scroll drives them identically.
   ============================================================ */

export function isTestMode(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    if (navigator.webdriver) return true;
    return localStorage.getItem("signal-site:test") === "1";
  } catch {
    return false;
  }
}
