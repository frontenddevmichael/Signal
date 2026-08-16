/**
 * §18/audit-fix sanitizer — the ONLY server-side defense for user-authored
 * rich text. notes.create stores TipTap HTML verbatim and the timeline renders
 * it via dangerouslySetInnerHTML, so anything pasted/imported into the editor
 * must be reduced to a strict allowlist here — the single choke point.
 *
 * Dependency-free tokenizer (no DOMParser — runs in the Convex default
 * runtime). Allowlisted tags only, allowlisted attributes only, and any
 * non-allowlisted construct is turned into inert text (HTML-escaped), never
 * dropped-silently as raw markup.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "mark",
  "sub",
  "sup",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "a",
  "span",
]);

/** Attributes allowed per tag (beyond none). Only <a href> survives. */
function allowedAttrs(token: string, tag: string): string {
  if (tag !== "a") return "";
  const href = /href\s*=\s*(["'])(.*?)\1/i.exec(token)?.[2];
  if (!href) return "";
  if (!isSafeUrl(href)) return "";
  return ` href="${escapeAttr(href)}"`;
}

/** Only http/https/mailto/tel and relative URLs — never javascript:/data:/vbscript:. */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith(".")) return true;
  return /^(https?:|mailto:|tel:)/i.test(trimmed);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Decode a small set of entities so re-escaping doesn't double-encode. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Rewrite a <...> token. Returns canonical markup, or null if it must be text. */
function rewriteTag(token: string): string | null {
  // Declarations, comments, processing instructions — never markup.
  if (token.startsWith("<!") || token.startsWith("<?")) return null;
  const close = token.startsWith("</");
  const nameMatch = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
  if (!nameMatch) return null;
  const tag = nameMatch[1].toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return null;
  if (close) return `</${tag}>`;
  return `<${tag}${allowedAttrs(token, tag)}>`;
}

/**
 * Reduce arbitrary HTML to the allowlist. Anything not allowlisted becomes
 * escaped text (visible, but inert — no script, no event handlers, no
 * javascript: URLs).
 */
export function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  let out = "";
  let i = 0;
  const n = raw.length;
  while (i < n) {
    if (raw[i] === "<") {
      const close = raw.indexOf(">", i + 1);
      if (close === -1) {
        // Unclosed tag — treat the remainder as inert text.
        out += escapeText(decodeEntities(raw.slice(i)));
        break;
      }
      const token = raw.slice(i, close + 1);
      const rewritten = rewriteTag(token);
      if (rewritten !== null) out += rewritten;
      else out += escapeText(decodeEntities(token));
      i = close + 1;
    } else {
      const next = raw.indexOf("<", i);
      const text = next === -1 ? raw.slice(i) : raw.slice(i, next);
      out += escapeText(decodeEntities(text));
      i = next === -1 ? n : next;
    }
  }
  return out;
}
