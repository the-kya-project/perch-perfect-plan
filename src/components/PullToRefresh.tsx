import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, AlertCircle } from "lucide-react";

// Native-style pull-to-refresh for the app's document-scrolling screens.
//
// Wrap a screen (or a layout's <Outlet/>). When the document is scrolled to the
// very top and the user drags down, a spinner slides in from the top; releasing
// past the threshold runs `onRefresh` (default: refetch every active query, i.e.
// the current screen's data). The indicator then resolves to a clear "Updated"
// (or, on failure/timeout, "Couldn't refresh") confirmation that lingers briefly
// and fades — so a refresh that changed nothing on screen still reads as done.
// Content stays in place (no transform), so fixed navs/sticky headers are
// untouched and it works the same in the installed PWA.
//
// Two things keep it from degrading scrolling elsewhere:
//   - The non-passive touchmove listener (the one that can preventDefault) is
//     attached ONLY for a gesture that actually armed at the document top, and
//     removed on release — so the rest of the owner app and the sitter view keep
//     compositor-thread scrolling instead of paying for a permanent handler.
//   - Arming resolves the touch's nearest scrollable ancestor: a touch inside an
//     overlay/sheet's own scroller never arms, so those sheets scroll normally
//     and the page behind them doesn't refresh.
const THRESHOLD = 64; // drag distance (after resistance) needed to trigger
const MAX = 96; // cap so the indicator doesn't run away
const MIN_SPIN = 600; // keep the spinner up at least this long so a fast refetch doesn't flash
const MAX_WAIT = 10_000; // give up after this and show the failed state instead of hanging
const HOLD_DONE = 1_000; // how long the "Updated" / failed confirmation lingers before fading

type Phase = null | "spin" | "done" | "fail";

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
  const busyRef = useRef(false); // true from release through the whole feedback sequence
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Nearest INNER scrollable element between the touch target and the wrapper.
    // Stops before the document scrollers (body/documentElement) so ordinary
    // document-scrolling screens fall through to the window.scrollY check.
    function innerScroller(target: EventTarget | null): HTMLElement | null {
      let node = target instanceof Element ? target : null;
      while (node && node !== el && node !== document.body && node !== document.documentElement) {
        const oy = getComputedStyle(node).overflowY;
        if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 1) return node as HTMLElement;
        node = node.parentElement;
      }
      return null;
    }

    function detachMove() {
      el!.removeEventListener("touchmove", onMove);
    }

    function reset() {
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
      setDragging(false);
      detachMove();
    }

    function onMove(e: TouchEvent) {
      if (startY.current === null || busyRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { reset(); return; } // pulling up → hand back to native scrolling
      const dist = Math.min(MAX, dy * 0.5); // resistance
      pullRef.current = dist;
      setDragging(true);
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // suppress the native rubber-band while pulling
    }

    function onStart(e: TouchEvent) {
      if (busyRef.current || e.touches.length !== 1) { startY.current = null; return; }
      // Arm only in the document scroll context, at the very top. A touch inside
      // an overlay/sheet's own scroller resolves to an inner scroller → don't arm,
      // so the sheet scrolls normally (fixes all the fixed inset-0 sheets at once).
      if (innerScroller(e.target) || window.scrollY > 0) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      // Non-passive touchmove ONLY for this armed gesture; removed on release so
      // the rest of the app keeps compositor-thread scrolling.
      el!.addEventListener("touchmove", onMove, { passive: false });
    }

    async function runRefresh() {
      busyRef.current = true;
      setPhase("spin");
      setPull(THRESHOLD);
      const startedAt = Date.now();
      let ok = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fn = onRefreshRef.current ?? (() => qc.refetchQueries({ type: "active" }));
        const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), MAX_WAIT); });
        await Promise.race([Promise.resolve(fn()), timeout]);
      } catch {
        ok = false; // network error, a rejected refetch, or the MAX_WAIT timeout
      } finally {
        if (timer) clearTimeout(timer);
      }
      // Hold the spinner a beat so a sub-100ms refetch doesn't just flicker.
      const spent = Date.now() - startedAt;
      if (spent < MIN_SPIN) await sleep(MIN_SPIN - spent);
      if (cancelled) return;
      setPhase(ok ? "done" : "fail"); // on failure, existing content is left intact
      await sleep(HOLD_DONE);
      if (cancelled) return;
      setPhase(null);
      setPull(0);
      pullRef.current = 0;
      busyRef.current = false;
    }

    function onEnd() {
      detachMove();
      if (startY.current === null) return;
      const reached = pullRef.current >= THRESHOLD;
      startY.current = null;
      setDragging(false);
      if (reached && !busyRef.current) {
        void runRefresh();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      cancelled = true;
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      detachMove();
    };
  }, [qc]);

  const active = phase !== null;
  const offset = active ? THRESHOLD : pull;
  const visible = offset > 0 || active;
  const label = phase === "done" ? "Updated" : phase === "fail" ? "Couldn't refresh" : null;

  return (
    <div ref={ref}>
      <div
        aria-hidden={!visible}
        role="status"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-[max(env(safe-area-inset-top),0.5rem)]"
        style={{
          transform: `translateY(${Math.min(offset, THRESHOLD) - 44}px)`,
          opacity: visible ? Math.min(1, offset / THRESHOLD) : 0,
          transition: dragging ? "none" : "transform .25s ease, opacity .2s ease",
        }}
      >
        <div
          className={`flex items-center gap-1.5 rounded-full bg-white shadow-md ring-1 ring-black/5 ${
            label ? "px-3.5 py-2" : "size-9 justify-center"
          }`}
        >
          {phase === "done" ? (
            <Check className="size-4 text-[var(--moss)]" strokeWidth={2.5} />
          ) : phase === "fail" ? (
            <AlertCircle className="size-4 text-[var(--amber-ink)]" />
          ) : (
            <Loader2
              className={`size-4 text-[var(--ink)] ${phase === "spin" ? "animate-spin" : ""}`}
              style={phase === "spin" ? undefined : { transform: `rotate(${Math.round(offset * 3)}deg)` }}
            />
          )}
          {label && <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}
