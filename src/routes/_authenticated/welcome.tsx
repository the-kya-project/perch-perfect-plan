import { createFileRoute, redirect } from "@tanstack/react-router";
import { takeReturnTo } from "@/lib/returnTo";

// The first-run welcome is now the first step of the owner onboarding overlay,
// which runs on the dashboard (welcome → nav tour → checklist hand-off) gated by
// profiles.welcome_seen_at. This route just forwards there so existing links —
// the signup confirmation email's redirect and any saved /welcome URLs — still
// land in the right place without a second, competing welcome screen.
export const Route = createFileRoute("/_authenticated/welcome")({
  beforeLoad: () => {
    // Google/Apple sign-in always comes back here. If the reader set out from a
    // deep link (an email button), /auth stashed it before the round trip —
    // forward there instead. This route is client-only (ssr:false upstream).
    const returnTo = typeof window !== "undefined" ? takeReturnTo() : null;
    if (returnTo) throw redirect({ href: returnTo, replace: true });
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
