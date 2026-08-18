import { useEffect, useState } from "react";
import { SignalBar } from "signal-ui/SignalBar";
import { Icon } from "signal-ui/Icons";
import { initSound, soundEnabled, toggleSound } from "../lib/sound";
import { motionMode, setMotionMode, watchReducedMotion } from "../lib/motionGate";
import { APP_URL, hasAppUrl } from "../config";

export default function Topbar() {
  const [sound, setSound] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    initSound();
    setSound(soundEnabled());
    setReduced(motionMode() === "simple");
    const off = watchReducedMotion((r) => setReduced(r || motionMode() === "simple"));
    return off;
  }, []);

  const onToggleSound = () => {
    setSound(toggleSound());
  };

  const onToggleReduced = () => {
    const next = !reduced;
    setReduced(next);
    setMotionMode(next ? "simple" : "full");
    window.location.reload();
  };

  return (
    <header className="site-topbar">
      <a className="site-brand" href="#top" aria-label="Signal — home">
        <SignalBar size={20} className="mark" />
        <span>Signal</span>
      </a>

      <nav className="topbar-nav" aria-label="Sections">
        <a href="#features">Features</a>
        <a href="#demo">Demo</a>
        <a href="#terminal">Terminal</a>
        <a href="#pulse">Pulse</a>
        <a href="#pricing">Pricing</a>
      </nav>

      <div className="topbar-actions">
        <div className="menu-anchor">
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            aria-label="Page preferences — sound and motion"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={sound ? "sound-on" : "sound-off"} label={sound ? "Sound on" : "Sound off"} size={18} />
          </button>
          {menuOpen && (
            <>
            <div className="menu-panel" role="menu">
              <button
                type="button"
                className="menu-row"
                role="menuitemcheckbox"
                aria-checked={sound}
                onClick={onToggleSound}
              >
                <Icon name={sound ? "sound-on" : "sound-off"} label="" size={16} />
                <span>
                  Signal ping
                  <small>One soft tone when the hero settles.</small>
                </span>
                <span className="menu-check">{sound ? "On" : "Off"}</span>
              </button>
              <button
                type="button"
                className="menu-row"
                role="menuitemcheckbox"
                aria-checked={reduced}
                onClick={onToggleReduced}
              >
                <Icon name="alert" label="" size={16} />
                <span>
                  Reduce motion
                  <small>Simplified crossfade, no scroll physics.</small>
                </span>
                <span className="menu-check">{reduced ? "On" : "Off"}</span>
              </button>
            </div>
            {/* Mobile-only section jump links — the topbar nav hides below
                768px, so the menu carries the sections on small screens. */}
            <nav className="menu-sections" aria-label="Sections">
              <span className="menu-sections-label num">Page</span>
              <a className="menu-row" href="#features">Features</a>
              <a className="menu-row" href="#demo">Demo</a>
              <a className="menu-row" href="#terminal">Terminal</a>
              <a className="menu-row" href="#pulse">Pulse</a>
              <a className="menu-row" href="#pricing">Pricing</a>
            </nav>
            </>
          )}
        </div>

        {hasAppUrl ? (
          <a className="btn btn-primary" href={APP_URL}>
            <span className="btn-cta-label">Sign in</span>
            <Icon name="arrow-right" label="" size={14} />
          </a>
        ) : (
          <a className="btn btn-primary" href="#demo">
            <span className="btn-cta-label">See it run</span>
            <Icon name="arrow-right" label="" size={14} />
          </a>
        )}
      </div>
    </header>
  );
}
