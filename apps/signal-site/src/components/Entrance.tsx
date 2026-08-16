import { useRef } from "react";
import Hero from "./Hero";
import CursorTrail from "./CursorTrail";

/* ============================================================
   Entrance — the one island that owns the hero's scroll
   progress and hands it to the cursor trail. CursorTrail is
   ALWAYS rendered (canvas present in the SSR HTML) so server
   and client trees match; the trail decides in its effect
   whether it actually runs (gate). No scrolling setState.
   ============================================================ */

export default function Entrance() {
  const progressRef = useRef(0);

  return (
    <>
      <Hero progressRef={progressRef} />
      <CursorTrail progressRef={progressRef} />
    </>
  );
}
