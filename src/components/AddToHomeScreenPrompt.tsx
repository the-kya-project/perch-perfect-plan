/**
 * Gentle one-time hint shown to iOS Safari users who haven't installed the
 * app yet. iOS only delivers push notifications to PWAs that have been
 * added to the Home Screen — so we surface this AFTER a calm, successful
 * moment (dashboard load with at least one bird), never mid-task.
 *
 * Hidden when:
 *  - not iOS Safari
 *  - already installed (standalone)
 *  - previously dismissed (localStorage flag)
 */
import { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

const DISMISS_KEY = "kya:a2hs-dismissed";

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
  return iOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof navigator === "undefined") return false;
  // @ts-expect-error iOS-only
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function AddToHomeScreenPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOSSafari() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* ignore */ }
    // Small delay so it appears AFTER the page settles, not during render.
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-200 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-sage-900">
            Add Parrot Care to your Home Screen
          </div>
          <p className="mt-1 text-xs text-sage-600">
            Tap <Share className="inline size-3.5 align-text-bottom" /> in Safari, then
            choose <span className="font-semibold">Add to Home Screen</span>. This is
            required on iPhone to receive push alerts from sitters.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-1 text-sage-500 hover:bg-sage-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
