import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Parrot Care Co-Pilot" }] }),
  component: NotificationsPage,
});

type Prefs = {
  notify_sitter_opened: boolean;
  notify_sitter_log: boolean;
  notify_care_plan_reminder: boolean;
};

const ROWS: { key: keyof Prefs; title: string; desc: string }[] = [
  {
    key: "notify_sitter_opened",
    title: "Sitter opened the care sheet",
    desc: "Email me when a sitter first opens or starts using the shared care sheet.",
  },
  {
    key: "notify_sitter_log",
    title: "Sitter added a daily log",
    desc: "Email me when a sitter posts a new daily log entry during a sit.",
  },
  {
    key: "notify_care_plan_reminder",
    title: "Care plan update reminder",
    desc: "Email me a reminder to review the care plan before an upcoming sit.",
  },
];

function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("notify_sitter_opened, notify_sitter_log, notify_care_plan_reminder")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data) setPrefs(data as Prefs);
    })();
  }, []);

  async function toggle(key: keyof Prefs, next: boolean) {
    if (!prefs) return;
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const patch: Partial<Prefs> = { [key]: next } as Partial<Prefs>;
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", u.user.id);
      if (error) throw error;
    } catch (e: any) {
      setPrefs({ ...prefs, [key]: prev });
      toast.error(e.message ?? "Could not save preference.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-md px-5 py-6">
        <Link to="/account" className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Account
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-sage-600">
          Choose which product and sitter activity emails you'd like to receive.
        </p>

        <section className="mt-6 space-y-3">
          {ROWS.map((row) => {
            const checked = prefs ? prefs[row.key] : false;
            return (
              <label
                key={row.key}
                className="flex items-start justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-sage-100"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold text-sage-900">{row.title}</div>
                  <p className="mt-1 text-xs text-sage-600">{row.desc}</p>
                </div>
                <input
                  type="checkbox"
                  className="mt-1 size-5 rounded border-sage-300"
                  checked={checked}
                  disabled={!prefs || saving === row.key}
                  onChange={(e) => toggle(row.key, e.target.checked)}
                />
              </label>
            );
          })}
        </section>

        <section className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Health &amp; behavior alerts are always on
            </div>
            <p className="mt-1 text-xs text-amber-800">
              If a sitter flags a health or behavior concern, we'll always email you.
              This safety alert can't be turned off.
            </p>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-sage-600">
          Email delivery is being rolled out — your preferences are saved and will be
          respected as soon as each notification ships.
        </p>
      </main>
    </div>
  );
}
