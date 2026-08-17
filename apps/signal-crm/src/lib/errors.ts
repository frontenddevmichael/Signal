/**
 * Convex wraps server-thrown errors into an envelope like
 * `[CONVEX A(email:sendInvoice)] [Request ID: 8070be30…] Server Error
 *  Uncaught Error: <real message>
 *  at handler (../convex/email.ts:99:4)
 *
 *  Called by client`.
 * The user should see only the underlying message — never the Request ID,
 * module path, or stack noise (visibility of system status §5.3: the error
 * is real and shown, but presented as a human sentence, not a raw dump).
 */
export function friendlyError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const marker = "Uncaught Error: ";
  let msg = "";
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    msg = raw.slice(idx + marker.length).split("\n")[0].trim();
  } else {
    // No wrapper — clean the first line of any Convex prefix anyway.
    msg = (raw.split("\n")[0] ?? "")
      .replace(/^\[CONVEX[^\]]*\]\s*\[Request ID: [^\]]*\]\s*(Server Error\s*)?/i, "")
      .trim();
  }
  // The envelope's trailing "Called by client" / stack lines are dropped by
  // the newline split; guard against the odd case where the message is empty.
  return msg || fallback;
}
