import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ShieldCheck, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Disclaimer } from "@/components/Disclaimer";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/")({
  // Returning owners shouldn't land on the marketing page — send them home.
  // Client-only: the session lives in localStorage, so during SSR/prerender
  // there's no session and new visitors/crawlers still get the landing page.
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Parrot Care Co-Pilot — by The Kya Project" },
      { name: "description", content: "Owners build a complete bird care plan. Sitters open a secure link, follow the routine, run a daily health scan, and reach emergency help fast." },
      { property: "og:title", content: "Parrot Care Co-Pilot — by The Kya Project" },
      { property: "og:description", content: "Care plans, daily health scans, and emergency guidance for parrot sitters." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        <BrandLogo size="md" />

        <div className="mt-12 space-y-3">
          <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight">
            Calm, clear care for your bird — even when you can't be there.
          </h1>
          <p className="text-pretty text-base text-[#5f5e5a]">
            Owners build a thorough care plan once. Sitters get a secure link with today's routine, a daily health scan, and one-tap emergency contacts.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          <Link
            to="/auth"
            search={{ mode: "signup" as const }}
            className="block rounded-2xl bg-[#1a3d2e] px-5 py-5 text-white shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest opacity-80">I'm an owner</p>
                <p className="mt-1 text-lg font-medium">Manage my bird's care plan</p>
              </div>
              <ClipboardList className="size-6 shrink-0 opacity-80" />
            </div>
          </Link>
          <div className="rounded-[20px] bg-[#efe9da] p-5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">I'm a sitter</p>
            <p className="mt-1 text-lg font-medium">Open the link from the owner</p>
            <p className="mt-2 text-sm text-[#5f5e5a]">
              No signup needed — your sitter link unlocks today's routine, the health scan, the care guide, and emergency contacts.
            </p>
          </div>
        </div>

        <div className="mt-auto pt-10">
          <Disclaimer compact />
          <p className="mt-3 text-center text-[11px] text-[#5f5e5a]">
            <Link to="/auth" search={{ mode: "signin" as const }} className="font-medium underline">
              Already have an account? Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
