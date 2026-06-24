import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Calendar } from "lucide-react";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { SitForm } from "@/components/SitForm";
import { SitCard } from "@/components/SitCard";
import { InkHero, SectionHead, Card, type HeroCta } from "@/components/system";

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
  const navigate = useNavigate();
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

  // ----- group the existing sits for Next up / Later / Past (data unchanged) --
  // "Next up" = the imminent/active sit (active if one is underway, else the
  // soonest upcoming). "Later" = remaining upcoming sits. "Past" = everything
  // that has already ended. Ordering still comes from the start_date-desc query.
  const allSits = sits as any[];
  const upcoming = allSits
    .filter((s) => s.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = allSits.filter((s) => s.end_date < today);
  const nextUp = upcoming[0] ?? null;
  const later = upcoming.slice(1);

  const birdsFor = (s: any) =>
    ((s.sit_birds ?? []) as any[]).map((sb: any) => birdLookup[sb.bird_id]).filter(Boolean);

  const heroCta: HeroCta = {
    label: "Set up a sit",
    tone: "lime",
    icon: <Plus className="size-4" />,
    // Opens SitForm via the existing initialOpen/?newSit flow.
    onPress: () => navigate({ to: "/sits", search: { newSit: true } }),
  };

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          eyebrow="Sits"
          headline="Going away?"
          body="For when you can't be there — set up a sit and share what they need to know."
          cta={birds.length > 0 ? heroCta : undefined}
          trailingIcons={<OwnerHeaderIcons />}
        />

        <main className="space-y-4 px-5 pt-5">
          {birds.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <div className="flex justify-center">
                  <span className="grid size-12 place-items-center rounded-[14px] bg-[var(--pale2)] text-[var(--moss)]">
                    <Calendar className="size-6" />
                  </span>
                </div>
                <p className="t-section mt-3">Add a bird first</p>
                <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">
                  A sit shares one or more birds' care plans with a sitter. Add a bird to create your first sit.
                </p>
                <Link
                  to="/birds/new"
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white active:scale-[0.99]"
                >
                  <Plus className="size-4" /> Add bird
                </Link>
              </div>
            </Card>
          ) : (
            <>
              {/* Open/save flow preserved exactly — SitForm owns its own open
                  state (initialOpen/?newSit) and renders the create form inline. */}
              <SitForm
                birds={birds}
                onSaved={refreshSits}
                initialOpen={!!newSit}
                preselectBirdId={preselectBirdId}
                activeSit={activeSit}
                returnTo="/sits"
                hidePrompt
              />

              {sitsLoading ? (
                <div className="space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-28 animate-pulse rounded-[18px] bg-[var(--cream2)]" />
                  ))}
                </div>
              ) : allSits.length > 0 ? (
                <>
                  {nextUp && (
                    <section className="space-y-3">
                      <SectionHead title="Next up" />
                      <SitCard
                        sit={nextUp}
                        birds={birdsFor(nextUp)}
                        allBirds={birds}
                        onChange={refreshSits}
                      />
                    </section>
                  )}

                  {later.length > 0 && (
                    <section className="space-y-3">
                      <SectionHead title="Later" />
                      {later.map((s) => (
                        <SitCard key={s.id} sit={s} birds={birdsFor(s)} allBirds={birds} onChange={refreshSits} />
                      ))}
                    </section>
                  )}

                  {past.length > 0 && (
                    <section className="space-y-3">
                      <SectionHead title="Past" />
                      {past.map((s) => (
                        <SitCard key={s.id} sit={s} birds={birdsFor(s)} allBirds={birds} onChange={refreshSits} />
                      ))}
                    </section>
                  )}
                </>
              ) : (
                <Card>
                  <div className="p-8 text-center">
                    <div className="flex justify-center">
                      <span className="grid size-12 place-items-center rounded-[14px] bg-[var(--pale2)] text-[var(--moss)]">
                        <Calendar className="size-6" />
                      </span>
                    </div>
                    <p className="t-section mt-3">No sits yet</p>
                    <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">
                      Set up a sit to send a sitter a private, read-only link to your bird's care plan.
                    </p>
                  </div>
                </Card>
              )}

              <p className="t-meta pt-1 text-center">For permanent help, see Household in settings.</p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
