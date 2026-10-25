// Where a guided-tour step's highlight goes: the element tagged
// data-coach="<target>", scrolled into the clear part of the screen first.
//
// Shared by the three coach-mark tours (SitterOnboarding, OwnerOnboarding,
// MemberOnboarding). Each step:
//   1. waits for the element to exist (it may be on a screen the tour just
//      navigated to) and to stop moving: care-sheet sections and photos load
//      late and push it down;
//   2. smooth-scrolls it to the middle of the space between whatever is pinned
//      to the top (sticky headers, the chip row) and the bottom (the tab bar or
//      Emergency bar, the iPhone home bar), leaving room under it for the
//      tooltip;
//   3. measures it once the scroll has finished, and again whenever the page
//      scrolls, the element changes size, or the phone rotates.
// A step whose element never shows up reports "missing", so the tour can skip
// it (or center its bubble) instead of highlighting empty space.
//
// Pinned bars are found from the page itself (anything fixed or sticky at the
// top or bottom edge), so the tours don't hard-code header and nav heights.
import { useEffect, useRef, useState } from "react";

export type CoachRect = { top: number; left: number; width: number; height: number; bottom: number };
export type CoachInsets = { top: number; bottom: number };
export type CoachSpot = {
  /** The step this result is for. A tour must ignore a result from an earlier
   *  step: for one render after a step changes, the old one is still here. */
  stepKey: unknown;
  status: "idle" | "searching" | "ready" | "missing";
  rect: CoachRect | null;
  vw: number;
  vh: number;
  /** Screen space covered at the top and bottom (pinned bars + safe areas). */
  insets: CoachInsets;
};

/** How long a step waits for its element before calling it missing. */
const FIND_MS = 5000;
/** How long a found element may keep moving (late images, data) before we scroll anyway. */
const SETTLE_MS = 2500;
const STABLE_FRAMES = 3;
/** Scroll attempts per step before showing the highlight wherever it is. */
const MAX_SCROLLS = 3;

const IDLE: CoachSpot = { stepKey: null, status: "idle", rect: null, vw: 0, vh: 0, insets: { top: 0, bottom: 0 } };

function isFixed(el: HTMLElement | null): boolean {
  let n: HTMLElement | null = el;
  while (n && n !== document.body) {
    if (window.getComputedStyle(n).position === "fixed") return true;
    n = n.parentElement;
  }
  return false;
}

/** The iPhone notch and home-bar areas, from the CSS env() values. */
function safeAreas(): CoachInsets {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return out;
}

/** Space taken by bars pinned to the top or bottom edge (the tour's own
 *  overlay excluded), plus the safe areas. Sticky bars count by where they
 *  pin, whether or not they're stuck yet. */
export function pinnedInsets(): CoachInsets {
  const vh = window.innerHeight;
  const safe = safeAreas();
  let top = safe.top;
  let bottom = safe.bottom;
  const els = document.querySelectorAll<HTMLElement>(".fixed, .sticky, nav, header");
  els.forEach((el) => {
    if (el.closest("[data-coach-overlay]")) return;
    const cs = window.getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width < window.innerWidth * 0.5 || r.height > vh * 0.4) return;
    if (cs.position === "sticky") {
      if (cs.top !== "auto") top = Math.max(top, (parseFloat(cs.top) || 0) + r.height);
      else if (cs.bottom !== "auto") bottom = Math.max(bottom, (parseFloat(cs.bottom) || 0) + r.height);
      return;
    }
    if (r.top <= 2 && r.bottom < vh / 2) top = Math.max(top, r.bottom);
    else if (r.bottom >= vh - 2 && r.top > vh / 2) bottom = Math.max(bottom, vh - r.top);
  });
  return { top, bottom };
}

function rectOf(el: Element): CoachRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
}

/** Images above or inside the element that are still loading (they'll push
 *  it). Lazy ones count too: a bird photo near the top is lazy and on screen.
 *  SETTLE_MS caps the wait if one never arrives. */
function pendingImagesAbove(el: HTMLElement): boolean {
  const limit = el.getBoundingClientRect().bottom;
  for (const img of Array.from(document.images)) {
    if (img.complete) continue;
    if (img.getBoundingClientRect().top <= limit) return true;
  }
  return false;
}

/** Where to scroll so the element sits mid-way in the clear band, with
 *  `reserveBelow` px left under it for the tooltip. */
function scrollTargetFor(el: HTMLElement, insets: CoachInsets, reserveBelow: number): number {
  const vh = window.innerHeight;
  const r = el.getBoundingClientRect();
  const bandTop = insets.top + 8;
  const bandBottom = vh - insets.bottom - 8;
  const room = bandBottom - bandTop - reserveBelow;
  // Fits with the tooltip under it: center it in the space above the tooltip.
  // Taller than that: show its top, just under the pinned header.
  const wantTop = r.height <= room ? bandTop + (room - r.height) / 2 : bandTop;
  const max = Math.max(0, document.documentElement.scrollHeight - vh);
  return Math.min(max, Math.max(0, window.scrollY + r.top - wantTop));
}

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/**
 * Track the highlight for `target` on step `stepKey`. `reserveBelow` is the
 * tooltip's height plus its gap, so the tooltip fits under the element.
 * `minInsets` keeps clear of the tour's own controls (its Close and Emergency
 * buttons along the top), which the page scan deliberately skips.
 */
export function useCoachSpot(
  target: string | null,
  stepKey: unknown,
  reserveBelow: number,
  minInsets: CoachInsets = { top: 0, bottom: 0 },
): CoachSpot {
  const [spot, setSpot] = useState<CoachSpot>(IDLE);
  // The tooltip measures itself after the first render; read the latest.
  const reserveRef = useRef(reserveBelow);
  reserveRef.current = reserveBelow;
  const minTop = minInsets.top;
  const minBottom = minInsets.bottom;

  useEffect(() => {
    if (!target) { setSpot({ ...IDLE, stepKey }); return; }
    let raf = 0;
    let done = false;
    let el: HTMLElement | null = null;
    let insets: CoachInsets = { top: 0, bottom: 0 };
    let ro: ResizeObserver | null = null;
    const started = performance.now();
    const selector = `[data-coach="${target}"]`;
    const vp = () => ({ vw: window.innerWidth, vh: window.innerHeight });
    const clearInsets = (): CoachInsets => {
      const p = pinnedInsets();
      return { top: Math.max(p.top, minTop), bottom: Math.max(p.bottom, minBottom) };
    };

    setSpot({ stepKey, status: "searching", rect: null, ...vp(), insets: { top: 0, bottom: 0 } });

    const measure = () => {
      if (done || !el) return;
      if (!el.isConnected) {
        // Re-rendered under us: pick up the new node.
        el = document.querySelector<HTMLElement>(selector);
        if (!el) return;
      }
      insets = clearInsets();
      setSpot({ stepKey, status: "ready", rect: rectOf(el), ...vp(), insets });
    };

    /** Is the element where we put it: its top inside the clear band? */
    const inBand = (): boolean => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= insets.top - 2 && r.top <= window.innerHeight - insets.bottom - 24;
    };

    const scrollIntoBand = (then: () => void, attempt = 1) => {
      if (!el || isFixed(el)) { then(); return; }
      insets = clearInsets();
      const to = scrollTargetFor(el, insets, reserveRef.current);
      if (Math.abs(to - window.scrollY) < 2) { then(); return; }
      // The last try jumps: a smooth scroll that something keeps interrupting
      // would otherwise never arrive.
      const smooth = attempt < MAX_SCROLLS && !reducedMotion();
      window.scrollTo({ top: to, behavior: smooth ? "smooth" : "auto" });
      // Wait for the scroll to finish: scrollY steady for a few frames (Safari
      // has no reliable scrollend). A long care sheet can take a while.
      let last = -1;
      let steady = 0;
      const t0 = performance.now();
      const wait = () => {
        if (done) return;
        const y = window.scrollY;
        steady = Math.abs(y - last) < 0.5 ? steady + 1 : 0;
        last = y;
        if (steady < 4 && performance.now() - t0 < 2500) { raf = requestAnimationFrame(wait); return; }
        // Landed somewhere else (the page moved under the scroll, or a late
        // router or page scroll undid it): go again.
        if (!inBand() && attempt < MAX_SCROLLS) { scrollIntoBand(then, attempt + 1); return; }
        then();
      };
      raf = requestAnimationFrame(wait);
    };

    // Find the element, then let it settle before scrolling.
    let lastTop = NaN;
    let lastH = NaN;
    let stable = 0;
    let foundAt = 0;
    const find = () => {
      if (done) return;
      el = document.querySelector<HTMLElement>(selector);
      const now = performance.now();
      if (!el || el.getBoundingClientRect().height === 0) {
        if (now - started > FIND_MS) { setSpot({ stepKey, status: "missing", rect: null, ...vp(), insets: clearInsets() }); return; }
        raf = requestAnimationFrame(find);
        return;
      }
      if (!foundAt) foundAt = now;
      const r = el.getBoundingClientRect();
      // Position in the document, so our own scrolling doesn't count as movement.
      const docTop = r.top + window.scrollY;
      stable = Math.abs(docTop - lastTop) < 1 && Math.abs(r.height - lastH) < 1 ? stable + 1 : 0;
      lastTop = docTop;
      lastH = r.height;
      const settled = stable >= STABLE_FRAMES && !pendingImagesAbove(el);
      if (!settled && now - foundAt < SETTLE_MS) { raf = requestAnimationFrame(find); return; }
      scrollIntoBand(() => {
        measure();
        // From here on, follow the element: layout shifts and size changes.
        if (typeof ResizeObserver !== "undefined" && el) {
          ro = new ResizeObserver(() => measure());
          ro.observe(el);
          ro.observe(document.body);
        }
      });
    };
    raf = requestAnimationFrame(find);

    const onScroll = () => measure();
    // Rotation or a resize can push the element out of the band: bring it back.
    const onResize = () => { if (el) scrollIntoBand(measure); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [target, stepKey, minTop, minBottom]);

  return spot;
}
