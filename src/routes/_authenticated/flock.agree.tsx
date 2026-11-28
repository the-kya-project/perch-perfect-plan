import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GuidelinesWalkthrough } from "@/components/flock/GuidelinesWalkthrough";
import { GUIDELINES_VERSION, WALKTHROUGH_STEPS } from "@/flock/guidelines/version";
import { agreeToGuidelines, setWalkthroughOpen } from "@/flock/guidelines/agreement";
import { trackFlockWalkthrough } from "@/lib/flockAnalytics";
import { rememberMode } from "@/lib/flock";
import { FLOCK_ACCESS_QUERY, joinRedirect } from "@/lib/flockJoin";

// The community guidelines walk-through. The /flock layout sends everyone here
// who hasn't agreed to the current version (GUIDELINES_VERSION), from any way
// in: the Community button, a link, a notification. The step is in the URL
// (?step=1–3, replaced, never pushed), so a reload stays on the same screen and
// the system Back leaves the walk-through for the care page it came from.
// Agreeing saves the row, then opens the join step for someone who hasn't
// joined yet, or the feed for a member. It goes there directly, once: two
// navigations to /flock at the same moment (the button and an "already
// agreed" effect this page used to have) lost the layout's redirect to the
// join step, so a non-member got the member Flock and then Home, or looped
// between /flock and /flock/join (Nov 28, 2026; #592, #591). "Already agreed"
// is now the layout's beforeLoad.
type Search = { step?: number };

export const Route = createFileRoute("/_authenticated/flock/agree")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const n = Number(s.step);
    return Number.isInteger(n) && n >= 2 && n <= WALKTHROUGH_STEPS ? { step: n } : {};
  },
  component: FlockAgree,
});

function FlockAgree() {
  const { step: raw } = Route.useSearch();
  const step = raw ?? 1;
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Already agreed (another tab, or a stale link)? The /flock layout's
  // beforeLoad sends them on to the feed. Not an effect here: while the router
  // moves a non-member on to the join step, this page re-renders, and an
  // effect would send them back to /flock again and again.

  // Not in the Flock until they agree: the device stays in care mode, so
  // backing out (or reopening the app) lands on Home, not back here.
  useEffect(() => {
    rememberMode("care");
    setWalkthroughOpen(true);
    return () => setWalkthroughOpen(false);
  }, []);

  useEffect(() => { void trackFlockWalkthrough("flock_walkthrough_viewed", { step }); }, [step]);

  // Screen 1's close button, and Escape: back to the care side.
  const leave = () => {
    rememberMode("care");
    void navigate({ to: "/dashboard", replace: true });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      rememberMode("care");
      void navigate({ to: "/dashboard", replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <GuidelinesWalkthrough
      step={step}
      onStep={(n) => void navigate({ to: "/flock/agree", search: n === 1 ? {} : { step: n }, replace: true })}
      onReadFull={() => void navigate({ to: "/flock/guidelines" })}
      onClose={leave}
      onAgree={async () => {
        await agreeToGuidelines(qc);
        setWalkthroughOpen(false);
        void trackFlockWalkthrough("flock_guidelines_agreed", { version: GUIDELINES_VERSION });
        const access = await qc.fetchQuery(FLOCK_ACCESS_QUERY).catch(() => null);
        const to = joinRedirect(access, "/flock") === "/flock/join" ? "/flock/join" : "/flock";
        await navigate({ to, replace: true });
      }}
    />
  );
}
