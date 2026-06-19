import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyOAuthAttribution } from "@/lib/attribution";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { mode: "signin" as const } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // OAuth signups can't carry attribution metadata through the provider
  // round-trip, so fill it client-side on return. No-ops for users who already
  // have attribution or aren't freshly created (see applyOAuthAttribution).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) void applyOAuthAttribution(data.user as any);
    });
    return () => { cancelled = true; };
  }, []);

  return <Outlet />;
}
