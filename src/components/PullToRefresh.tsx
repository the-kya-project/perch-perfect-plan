import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Native-style pull-to-refresh for the app's document-scrolling screens.
//
// Wrap a screen (or a layout's <Outlet/>). When the page is scrolled to the very
// top and the user drags down, a spinner slides in from the top; releasing past
// the threshold runs `onRefresh` (default: refetch every active query, i.e. the
// current screen's data) and holds the spinner until it settles. Content stays
// in place (no transform), so fixed navs and sticky headers are untouched and it
// works the same in the installed PWA. On failure the spinner just stops and the
// existing content is left as-is.
const THRESHOLD = 64; // drag distance (after resistance) needed to trigger
const MAX = 96; // cap so the indicator doesn't run away

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh?: () => Promise<unknown>;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reset = () => { startY.current = null; pullRef.current = 0; setPull(0); setDragging(false); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) { startY.current = null; return; }
      // Only arm the gesture at the very top of the page.
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      // Pulling up, or no longer at the top → hand back to native scrolling.
      if (dy <= 0 || window.scrollY > 0) { reset(); return; }
      const dist = Math.min(MAX, dy * 0.5); // resistance
      pullRef.current = dist;
      setDragging(true);
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // suppress the native rubber-band while pulling
    };

    const onEnd = async () => {
      if (startY.current === null) return;
      const reached = pullRef.current >= THRESHOLD;
      startY.current = null;
      setDragging(false);
      if (reached && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          const fn = onRefreshRef.current ?? (() => qc.refetchQueries({ type: "active" }));
          await fn();
        } catch {
          /* leave existing content in place; just stop the spinner */
        }
        refreshingRef.current = false;
        setRefreshing(false);
      }
      pullRef.current = 0;
      setPull(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [qc]);

  const offset = refreshing ? THRESHOLD : pull;
  const visible = offset > 0 || refreshing;

  return (
    <div ref={ref}>
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-[max(env(safe-area-inset-top),0.5rem)]"
        style={{
          transform: `translateY(${Math.min(offset, THRESHOLD) - 44}px)`,
          opacity: visible ? Math.min(1, offset / THRESHOLD) : 0,
          transition: dragging ? "none" : "transform .25s ease, opacity .2s ease",
        }}
      >
        <div className="grid size-9 place-items-center rounded-full bg-white shadow-md ring-1 ring-black/5">
          <Loader2
            className={`size-4 text-[#1a3d2e] ${refreshing ? "animate-spin" : ""}`}
            style={refreshing ? undefined : { transform: `rotate(${Math.round(offset * 3)}deg)` }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
