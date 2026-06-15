import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Bird as BirdIcon, LogOut, ChevronRight, Calendar } from "lucide-react";
import { Disclaimer } from "@/components/Disclaimer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your birds — Parrot Care Companion" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("*, sits(id, start_date, end_date, status, sitter_name, revoked, token_expires_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-bold tracking-tight">Your birds</h1>
            <p className="text-[10px] uppercase tracking-wider text-sage-600">Owner dashboard</p>
          </div>
          <button onClick={signOut} className="rounded-full p-2 text-sage-600 hover:bg-sage-100" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-6">
        <Disclaimer compact />

        {birds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sage-200 bg-white p-8 text-center">
            <BirdIcon className="mx-auto size-8 text-sage-400" />
            <p className="mt-3 font-semibold">Add your first bird</p>
            <p className="mt-1 text-sm text-sage-600">
              Build a care plan once. Reuse and enrich it across every sit.
            </p>
            <Link to="/birds/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white">
              <Plus className="size-4" /> Add bird
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {birds.map((b: any) => {
                const activeSit = b.sits?.find((s: any) => !s.revoked && new Date(s.end_date) >= new Date(new Date().toDateString()));
                return (
                  <Link
                    key={b.id}
                    to="/birds/$birdId"
                    params={{ birdId: b.id }}
                    className="block rounded-2xl bg-white p-4 ring-1 ring-sage-100 shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={b.name} />
                      <div className="flex-1">
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-[11px] uppercase tracking-wider text-sage-600">{b.species ?? "Parrot"}</p>
                      </div>
                      <ChevronRight className="size-4 text-sage-400" />
                    </div>
                    {activeSit && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">
                        <Calendar className="size-3.5" />
                        Sit with {activeSit.sitter_name ?? "sitter"} · {activeSit.start_date} → {activeSit.end_date}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
            <Link
              to="/birds/new"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 bg-white/50 px-4 py-3 text-sm font-semibold text-sage-700"
            >
              <Plus className="size-4" /> Add another bird
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="grid size-12 place-items-center rounded-full bg-sage-100 text-sage-700 font-bold">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
