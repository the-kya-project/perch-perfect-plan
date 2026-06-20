import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Calendar } from "lucide-react";
import { OwnerHeader } from "@/components/OwnerHeader";
import { SitForm } from "@/components/SitForm";
import { SitCard } from "@/components/SitCard";

// Dedicated Sits tab: create / manage / edit sits. Reuses the same query keys
// as the dashboard (["birds"], ["all-sits"]) so the cache is shared and edits
// here reflect on Home and vice-versa.
const sitsSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/sits")({
  head: () => ({ meta: [{ title: "Sits — Parrot Care Co-Pilot" }] }),
  validateSearch: sitsSearch,
  component: SitsPage,
});

function SitsPage() {
  const qc = useQueryClient();
  const { newSit, preselectBirdId } = Route.useSearch();

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, photo_url, photo_position, setup_complete, setup_step, normal_weight")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sits = [], isLoading: sitsLoading } = useQuery({
    queryKey: ["all-sits"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        // Keep unnamed sits (is.null); a bare .neq would drop them because
        // NULL != '__preview__' is unknown, not true, in Postgres.
        .or("sitter_name.is.null,sitter_name.neq.__preview__")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refreshSits = () => qc.invalidateQueries({ queryKey: ["all-sits"] });
  const birdLookup = Object.fromEntries(birds.map((b: any) => [b.id, b]));
  const today = new Date().toISOString().slice(0, 10);
  const activeSit = (sits as any[]).find((s) => s.start_date <= today && s.end_date >= today) ?? null;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <OwnerHeader title="Sits" />

      <main className="mx-auto max-w-md space-y-6 px-5 pt-5">
        {birds.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
            <Calendar className="mx-auto size-8 text-[#2d6a4f]" />
            <p className="mt-3 font-medium text-[#1a3d2e]">Add a bird first</p>
            <p className="mt-1 text-sm text-[#5f5e5a]">A sit shares one or more birds' care plans with a sitter. Add a bird to create your first sit.</p>
            <Link to="/birds/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
              <Plus className="size-4" /> Add bird
            </Link>
          </div>
        ) : (
          <>
            <SitForm
              birds={birds}
              onSaved={refreshSits}
              initialOpen={!!newSit}
              preselectBirdId={preselectBirdId}
              activeSit={activeSit}
            />

            {sitsLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[20px] bg-[#efe9da]" />
                ))}
              </div>
            ) : sits.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-[21px] font-medium text-[#1a3d2e]">Your sits</h2>
                {(sits as any[]).map((s) => {
                  const sitBirds = (s.sit_birds ?? [])
                    .map((sb: any) => birdLookup[sb.bird_id])
                    .filter(Boolean);
                  return <SitCard key={s.id} sit={s} birds={sitBirds} allBirds={birds} onChange={refreshSits} />;
                })}
              </section>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
                <Calendar className="mx-auto size-8 text-[#2d6a4f]" />
                <p className="mt-3 font-medium text-[#1a3d2e]">No sits yet</p>
                <p className="mt-1 text-sm text-[#5f5e5a]">Create a sit above to send a sitter a private, read-only link to your bird's care plan.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
