import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLogo } from "@/components/BrandLogo";

// One-time owner welcome, shown on the FIRST sign-in only. The source of truth
// is an account-level flag (profiles.welcome_seen_at) so it never re-shows on a
// new device or browser. localStorage is a same-device fast-path that avoids a
// redirect flash on later visits; the DB flag is authoritative across devices.
const WELCOMED_KEY = "ppc_owner_welcomed";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Parrot Care Co-Pilot" }] }),
  component: Welcome,
});

function markLocalSeen() {
  try { window.localStorage.setItem(WELCOMED_KEY, "1"); } catch {}
}
function hasLocalSeen() {
  try { return window.localStorage.getItem(WELCOMED_KEY) === "1"; } catch { return false; }
}

function Welcome() {
  const navigate = useNavigate();
  // Until we know whether the owner has already seen the welcome, render a
  // neutral loading screen — never flash the welcome content to a returning user.
  const [checking, setChecking] = useState(true);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current) return;
    decided.current = true;

    const toDashboard = () => navigate({ to: "/dashboard", replace: true });

    // Fast path: this device has seen it. (DB flag is still authoritative; this
    // just skips a round-trip when we already know.)
    if (hasLocalSeen()) { toDashboard(); return; }

    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) { setChecking(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("welcome_seen_at")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data?.welcome_seen_at) {
        markLocalSeen();
        toDashboard();
      } else {
        setChecking(false); // first sign-in → show the welcome
      }
    })();
  }, [navigate]);

  async function start() {
    // Mark seen on the account (best-effort) and locally, then proceed.
    markLocalSeen();
    try {
      const { data: u } = await getLocalUser();
      if (u.user) {
        await supabase
          .from("profiles")
          .update({ welcome_seen_at: new Date().toISOString() })
          .eq("id", u.user.id);
      }
    } catch {}
    navigate({ to: "/dashboard", replace: true });
  }

  if (checking) {
    return <div className="min-h-screen bg-[#f4f1e8]" aria-hidden />;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f1e8] px-6 py-10 text-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>
        <h1 className="mt-8 text-2xl font-medium leading-tight text-[#1a3d2e]">Welcome to Parrot Care Co-Pilot</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5f5e5a]">
          Build your bird's complete care plan once, then share a private, always-ready link with any sitter. We'll
          walk you through getting set up — it only takes a few minutes.
        </p>
        <button
          onClick={start}
          className="mt-8 w-full rounded-xl bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
        >
          Get started
        </button>
      </div>
    </div>
  );
}
