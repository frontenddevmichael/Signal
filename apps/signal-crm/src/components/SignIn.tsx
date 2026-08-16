import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IconGoogle } from "./Icons";

/**
 * §20.1 sign-in. Email/password always; Google shown only when the server has
 * AUTH_GOOGLE_ID/SECRET configured (convex/users.ts authConfig) — never a
 * dead button that errors. §23.2: every async action shows its state; failures
 * are named inline, never silent.
 */
export function SignIn() {
  const { signIn } = useAuthActions();
  const config = useQuery(api.users.authConfig);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Single-operator tool (§7): the freelancer signs in OR creates the account
  // from the same form. This Convex Auth version requires an explicit flow.
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState<"password" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending("password");
    try {
      await signIn("password", { flow: mode, email, password });
      // Note: no navigation here — the Gate swaps to Shell on auth state change.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "signIn"
            ? "Could not sign in. Check your email and password."
            : "Could not create the account.",
      );
    } finally {
      setPending(null);
    }
  };

  const submitGoogle = async () => {
    setError(null);
    setPending("google");
    try {
      await signIn("google");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setPending(null);
    }
  };

  return (
    <div className="signin">
      <div className="signin-card surface-card">
        {/* §7 — signal-bar mark, same drawing as the favicon and sidebar. */}
        <svg className="signin-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="var(--surface-2)" stroke="var(--border-default)" />
          <path
            d="M10 32h11l5-16 7 32 5-16h16"
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={5}
            strokeLinecap="square"
          />
        </svg>
        <h1>Signal</h1>
        <p className="sub">The CRM for solo developers.</p>

        <form onSubmit={submitPassword} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="field-error-message" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={pending !== null}>
            {pending === "password" && <span className="spinner" aria-hidden="true" />}
            {pending === "password"
              ? (mode === "signIn" ? "Signing in…" : "Creating account…")
              : (mode === "signIn" ? "Sign in" : "Create account")}
          </button>
        </form>

        <button
          type="button"
          className="switch-mode"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "No account yet? Create one" : "Have an account? Sign in"}
        </button>

        {config?.googleConfigured ? (
          <>
            <div className="divider">or</div>
            <button type="button" className="btn btn-ghost" onClick={submitGoogle} disabled={pending !== null}>
              {pending === "google" ? <span className="spinner" aria-hidden="true" /> : <IconGoogle />}
              {pending === "google" ? "Connecting to Google…" : "Sign in with Google"}
            </button>
          </>
        ) : (
          <>
            <div className="divider">or</div>
          <p className="muted-note">Google sign-in will appear once OAuth is configured.</p>
          </>
        )}
      </div>
    </div>
  );
}
