import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flower2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { InkHero, Card, RecordRow, IconTile } from "@/components/system";

// Remembering — the memorial home for birds that have passed. Reached from the
// app menu by choice, never from Home (a passed bird leaves the active flock
// entirely). Every record is preserved: the rows link to the bird's kept
// moments, journal, and record. The after-passing guidance does NOT live here;
// it appears once, right after marking, then recedes.
export const Route = createFileRoute("/_authenticated/remembering")({
  head: () => ({ meta: [{ title: "Remembering — Kya & Co." }] }),
  component: Remembering,
});

function Remembering() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  const { data: birds = [], isLoading } = useQuery({
    queryKey: ["remembering-birds"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return [] as any[];
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, species, photo_url, photo_position, acquired_on, intake_date, created_at, passed_at")
        .eq("owner_id", u.user.id)
        .not("passed_at", "is", null)
        .order("passed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const resolvePhoto = useBirdPhotos(birds.map((b: any) => b.photo_url), 200);

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Remembering"
          headline="Remembering"
        />
        <main className="space-y-4 px-5 pt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 t-meta">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : birds.length === 0 ? (
            <Card className="p-8 text-center">
              <IconTile tone="pale" icon={<Flower2 className="size-5" />} />
              <p className="mt-3 t-body text-[var(--ink2)]">Nothing here, and that's a good thing.</p>
            </Card>
          ) : (
            birds.map((b: any) => {
              const photo = resolvePhoto(b.photo_url);
              return (
                <Card key={b.id} className="p-5">
                  <div className="flex items-center gap-3">
                    {photo ? (
                      <img src={photo.url} alt="" className="size-12 shrink-0 rounded-full object-cover ring-1 ring-[var(--line2)]" />
                    ) : (
                      <IconTile size={48} tone="pale" icon={<Flower2 className="size-5" />} />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="t-section">Remembering {b.name}</h2>
                      <p className="t-meta mt-0.5">{memorialSubtitle(b)}</p>
                    </div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-[13px] ring-1 ring-[var(--line2)]">
                    <RecordRow title="Moments and photos" chevron onClick={() => navigate({ to: "/birds/$birdId/moments", params: { birdId: b.id } })} />
                    <RecordRow title="Journal" chevron onClick={() => navigate({ to: "/birds/$birdId/journal", params: { birdId: b.id } })} />
                    {/* fromRemembering: the bird page's back returns HERE instead
                        of the home screen (a passed bird isn't in the flock). */}
                    <RecordRow title="Their record" chevron last onClick={() => navigate({ to: "/birds/$birdId", params: { birdId: b.id }, state: { fromRemembering: true } as any })} />
                  </div>
                  <p className="t-meta mt-3 leading-relaxed">
                    {b.name}'s daily care is paused. Everything you kept is still here, whenever you'd like to look back.
                  </p>
                </Card>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}

// "{species} · with you {years}" — the span from when they joined (acquired /
// intake / record creation) to when they passed.
function memorialSubtitle(b: any): string {
  const start = b.acquired_on ?? b.intake_date ?? b.created_at;
  const span = withYouSpan(start, b.passed_at);
  return b.species ? `${b.species} · with you ${span}` : `With you ${span}`;
}
function withYouSpan(startIso: string | null, endIso: string): string {
  if (!startIso) return "always";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const months = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"}`;
  const years = Math.round((months / 12) * 10) / 10;
  const label = Number.isInteger(years) ? String(years) : years.toFixed(1);
  return `${label} ${years === 1 ? "year" : "years"}`;
}
