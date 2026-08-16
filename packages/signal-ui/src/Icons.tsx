/* ============================================================
   Icons — the drawing register from signal-design.md §1.9
   24×24 grid, 1.5px stroke, ROUND caps, MITER joins (the v2
   rebuild register — identical to the product's own Icons.tsx;
   a drift guard test asserts the register stays in sync).
   Outline default; filled only for active.
   Every icon carries an aria-label.
   ============================================================ */
import type { SVGProps } from "react";

export type IconName =
  | "repo"
  | "table"
  | "sticky"
  | "invoice"
  | "chat"
  | "bell"
  | "calendar"
  | "branch"
  | "check"
  | "arrow-right"
  | "plus"
  | "external"
  | "copy"
  | "sound-on"
  | "sound-off"
  | "command"
  | "mail"
  | "clock"
  | "alert"
  | "search";

const PATHS: Record<IconName, React.ReactNode> = {
  repo: (
    <path d="M5 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1V4Zm13 13h3v2a3 3 0 0 1-3 3H8M9 8h6M9 12h6" />
  ),
  table: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16M10 10v9M4 15h6" />
    </>
  ),
  sticky: (
    <path d="M5 4h10l4 4v12H5V4Zm10 0v4h4M8 11h8M8 15h5" />
  ),
  invoice: (
    <>
      <path d="M6 4h12v16H6z" />
      <path d="M6 8h12M6 12h12M6 16h12" />
    </>
  ),
  chat: (
    <path d="M4 5h16v11H10l-5 4v-4H4V5Zm9 4h4M9 9h1" />
  ),
  bell: (
    <path d="M12 4a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6Zm-3 13a3 3 0 0 0 6 0" />
  ),
  calendar: (
    <path d="M5 5h14v14H5zM5 10h14M9 3v4M15 3v4M9 14h6" />
  ),
  branch: (
    <path d="M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 0v2a4 4 0 0 0 4 4h2M15 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm-6 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm3-10v10" />
  ),
  check: <path d="M5 12l5 5 9-10" />,
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  external: <path d="M9 5H5v14h14v-4m-8-6 8 8M13 9h4v4" />,
  copy: <path d="M9 5h9v12H9V5Zm-4 4h4v10h10" />,
  "sound-on": <path d="M5 9v6h4l5 4V5L9 9H5Zm9-2a5 5 0 0 1 0 10" />,
  "sound-off": <path d="M5 9v6h4l5 4V5L9 9H5Zm9-2a5 5 0 0 1 0 10M19 9l4 6m0-6-4 6" />,
  command: <path d="M9 9V6a3 3 0 1 0-3 3h3Zm6 0V6a3 3 0 1 1 3 3h-3Zm-6 6v3a3 3 0 1 1-3-3h3Zm6 0v3a3 3 0 1 0 3-3h-3Z" />,
  mail: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  clock: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v4l3 3" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 9v5M12 17.2v.4" />
    </>
  ),
  search: <path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm6.5 6.5L21 15" />,
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  /** Human label for screen readers. Required — no icon is self-evident. */
  label: string;
  size?: number;
}

export function Icon({ name, label, size = 20, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="miter"
      role="img"
      aria-label={label}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export function IconByName({
  name,
  label,
  size = 20,
  ...rest
}: IconProps) {
  return <Icon name={name} label={label} size={size} {...rest} />;
}
