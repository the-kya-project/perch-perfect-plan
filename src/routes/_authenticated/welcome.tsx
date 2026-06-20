import { createFileRoute, redirect } from "@tanstack/react-router";

// The first-run welcome is now the first step of the owner onboarding overlay,
// which runs on the dashboard (welcome → nav tour → checklist hand-off) gated by
// profiles.welcome_seen_at. This route just forwards there so existing links —
// the signup confirmation email's redirect and any saved /welcome URLs — still
// land in the right place without a second, competing welcome screen.
export const Route = createFileRoute("/_authenticated/welcome")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
