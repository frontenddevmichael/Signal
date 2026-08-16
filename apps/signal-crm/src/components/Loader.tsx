/**
 * §3.3 tier-3 loader — reserved for full-page/first-load moments only
 * (initial app load, slow backfills); never for minor fetches.
 * §7 — the signal-bar mark, same drawing as the favicon, with a quiet
 * monochrome pulse (opacity-only, honors reduced motion; the retired
 * Beacon ring is gone). The mark is aria-hidden; the region announces.
 */
export function Loader({ label = "Signal" }: { label?: string }) {
  return (
    <div className="loader-page" role="status" aria-label="Loading">
      <svg className="loader-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke="var(--border-default)" />
        <path
          className="loader-pulse"
          d="M12 32h10l4-14 6 28 4-14h16"
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={5}
          strokeLinecap="square"
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}
