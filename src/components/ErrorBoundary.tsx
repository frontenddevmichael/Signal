import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { IconAlert } from "./Icons";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * §4.5 — an error state is flat and quiet, deliberately distinct from an empty
 * state. One boundary at the routed-page level (keyed by route in the shell) so
 * a single crashing screen can't blank the app, with a clear recovery action.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately quiet in the console (the boundary already surfaces it).
    console.error("Screen crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" role="alert">
        <div className="empty-tile" aria-hidden="true">
          <IconAlert style={{ width: 24, height: 24 }} />
        </div>
        <h2>Something went wrong on this screen</h2>
        <p>Your data is safe. Reload the page to continue — if it keeps happening, check the console and report it.</p>
        <div className="empty-action">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
