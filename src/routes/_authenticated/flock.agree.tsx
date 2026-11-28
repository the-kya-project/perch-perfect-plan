import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GuidelinesWalkthrough } from "@/components/flock/GuidelinesWalkthrough";
import { GUIDELINES_VERSION, WALKTHROUGH_STEPS } from "@/flock/guidelines/version";
import { GUIDELINES_AGREED_QUERY, agreeToGuidelines, setWalkthroughOpen } from "@/flock/guidelines/agreement";
import { trackFlockWalkthrough } from "@/lib/flockAnalytics";
import { rememberMode } from "@/lib/flock";

// The community guidelines walk-through. The /flock layout sends everyone here
// who hasn't agreed to the current version (GUIDELINES_VERSION), from any way
// in: the Community button, a link, a notification. The step is in the URL
// (?step=1–3, replaced, never pushed), so a reload stays on the same screen and
// the system Back leaves the walk-through for the care page it came from.
// Agreeing saves the row, then opens the feed (the layout then sends a
// non-member on to the join step).
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
  const { data: agreed } = useQuery(GUIDELINES_AGREED_QUERY);

  // Already agreed (another tab, or a stale link): straight to the feed.
  useEffect(() => {
    if (agreed === true) void navigate({ to: "/flock", replace: true });
  }, [agreed, navigate]);

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
        await navigate({ to: "/flock", replace: true });
      }}
    />
  );
}
