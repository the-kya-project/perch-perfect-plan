import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { InkHero, Card } from "@/components/system";
import { PastSitCard, type ListSit } from "@/components/SitListCards";

// Past sits archive — reached only from the "Past sits" link on /sits. A
// sub-screen: smaller ink hero with a back arrow, no brand lockup.
export const Route = createFileRoute("/_authenticated/sits/past")({
  head: () => ({ meta: [{ title: "Past sits — Kya & Co." }] }),
  component: PastSitsPage,
});

function PastSitsPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const { data: sits = [], isLoading } = useQuery({
    queryKey: ["all-sits"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        .or("sitter_name.is.null,sitter_name.neq.__preview__")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const past = (sits as any[]).filter((s) => s.end_date < today); // already start_date desc

  // Batch-resolve household caregiver names.
  const householdIds = [...new Set(past.filter((s) => s.caregiver_user_id).map((s) => s.caregiver_user_id as string))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["sit-caregiver-names", householdIds.slice().sort().join(",")],
    enabled: householdIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", householdIds);
      return data ?? [];
    },
  });
  const nameById = new Map((profiles as any[]).map((p) => [p.id, (p.display_name ?? "").toString().trim() || "Household member"]));
  const caregiverName = (s: any): string =>
    s.caregiver_user_id ? (nameById.get(s.caregiver_user_id) ?? "Household member") : (s.sitter_name?.trim() || "Your sitter");

  // Batch scan counts (daily_logs are the health scans) for all past sits.
  const pastIds = past.map((s) => s.id);
  const { data: scanRows = [] } = useQuery({
    queryKey: ["past-sit-scans", pastIds.slice().sort().join(",")],
    enabled: pastIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("daily_logs").select("sit_id, triage_status").in("sit_id", pastIds);
      return data ?? [];
    },
  });
  const scanBySit = new Map<string, { scans: number; flagged: number }>();
  for (const r of scanRows as any[]) {
    const cur = scanBySit.get(r.sit_id) ?? { scans: 0, flagged: 0 };
    cur.scans += 1;
    if (r.triage_status === "red" || r.triage_status === "yellow") cur.flagged += 1;
    scanBySit.set(r.sit_id, cur);
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/sits" })}
          eyebrow="Past sits"
          headline="A history of help."
          body="Everyone who's cared for the flock."
        />

        <main className="space-y-3 px-5 pt-5">
          {isLoading ? (
            [0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-[16px] bg-[var(--cream2)]" />)
          ) : past.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <p className="t-section">No past sits yet</p>
                <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">Completed sits will show up here as a record of who's cared for your flock.</p>
              </div>
            </Card>
          ) : (
            past.map((s) => {
              const c = scanBySit.get(s.id) ?? { scans: 0, flagged: 0 };
              return (
                <PastSitCard key={s.id} sit={s as ListSit} caregiverName={caregiverName(s)} scans={c.scans} flagged={c.flagged} />
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
