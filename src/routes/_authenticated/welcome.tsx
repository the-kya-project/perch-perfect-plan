import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";

// One-time welcome shown right after a new owner signs up, before the dashboard.
// Gated per-device by localStorage so it never re-shows.
const WELCOMED_KEY = "ppc_owner_welcomed";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Parrot Care Co-Pilot" }] }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(WELCOMED_KEY)) {
        navigate({ to: "/dashboard", replace: true });
      }
    } catch {}
  }, [navigate]);

  function start() {
    try { window.localStorage.setItem(WELCOMED_KEY, "1"); } catch {}
    navigate({ to: "/dashboard", replace: true });
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
