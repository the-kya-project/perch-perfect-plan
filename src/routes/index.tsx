import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Disclaimer } from "@/components/Disclaimer";
import { BrandLockup } from "@/components/BrandLogo";

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
      { title: "Kya & Co. — Calm, clear care for your bird" },
      { name: "description", content: "Calm, clear care for your bird — even when you can't be there." },
      { property: "og:title", content: "Kya & Co. — Calm, clear care for your bird" },
      { property: "og:description", content: "Everything they need, everything you've learned, everything the people helping should know." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-[calc(env(safe-area-inset-top)+36px)]">
        {/* Left-aligned lockup anchors the page's reading axis (lockup →
            headline → subhead → primary card). ~42px tall via size 137. */}
        <div className="flex justify-start">
          <BrandLockup orientation="horizontal" variant="cream" size={137} />
        </div>

        <div className="mt-[42px] space-y-3">
          <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight">
            Calm, clear care for your bird — even when you can't be there.
          </h1>
          <p className="text-pretty text-base text-[#5f5e5a]">
            Owners build a thorough care plan once. Sitters get a secure link with today's routine, a daily health scan, and one-tap emergency contacts.
          </p>
        </div>

        {/* One primary action — the dark-green card routes to sign-up. */}
        <div className="mt-10">
          <Link
            to="/auth"
            search={{ mode: "signup" as const }}
            className="block rounded-2xl bg-[#1a3d2e] px-5 py-5 text-white shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-[#cdeab0]">Start here</p>
                <p className="mt-1 text-lg font-medium">Set up your bird's record</p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#cdeab0] text-[#1a3d2e]">
                <ArrowRight className="size-5" strokeWidth={2.2} />
              </span>
            </div>
          </Link>
        </div>

        {/* Two quiet exits below the primary, with a small breathing space.
            Exit 1 is a link to sign-in for returning users. Exit 2 is an
            INFORMATIONAL line for anyone who arrived via marketing while
            holding an invite — it answers the "where does my link go" question
            without pretending to be interactive (no button, no underline). */}
        <div className="mt-6 text-center">
          <p className="text-[13px] text-[#5f5e5a]">
            Already have an account?{" "}
            <Link to="/auth" search={{ mode: "signin" as const }} className="font-medium text-[#2d6a4f]">Sign in</Link>
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-[#8a897f]">
            Were you invited by someone? Open the link they sent you.
          </p>
        </div>

        <div className="mt-auto pt-10">
          <Disclaimer compact />
        </div>
      </main>
    </div>
  );
}
