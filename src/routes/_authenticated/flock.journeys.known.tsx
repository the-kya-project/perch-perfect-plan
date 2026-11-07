import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlowFooter, ToggleChip } from "@/components/flock/JourneyParts";
import { setKnownSkills, useBirdSkills, useInvalidateJourneys, useJourneyBirds, useJourneyTemplates } from "@/lib/journeyData";
import { birdPronoun, type BirdPronoun } from "@/lib/journeys";

// What does [bird] already know? (Batch 4, screen 6): tap skills to add them to
// the bird's skill list; those templates then show "[Bird] knows this".
export const Route = createFileRoute("/_authenticated/flock/journeys/known")({
  validateSearch: (s: Record<string, unknown>): { bird: string } => ({ bird: typeof s.bird === "string" ? s.bird : "" }),
  component: KnownSkills,
});

function introLine(t: TFunction, name: string, p: BirdPronoun): string {
  switch (p) {
    case "she": return t("flock.journeys.known.lineShe", "Tap anything {{name}} can already do. It goes on her skill list, and those journeys start as finished.", { name });
    case "he": return t("flock.journeys.known.lineHe", "Tap anything {{name}} can already do. It goes on his skill list, and those journeys start as finished.", { name });
    case "they": return t("flock.journeys.known.lineThey", "Tap anything {{name}} can already do. It goes on their skill list, and those journeys start as finished.", { name });
  }
}

function KnownSkills() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const { bird: birdId } = Route.useSearch();
  const { data: birds } = useJourneyBirds();
  const { data: templates } = useJourneyTemplates();
  const { data: skills } = useBirdSkills(birdId);
  const bird = birds?.find((b) => b.id === birdId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const loaded = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what's already on the list (known or learned).
  useEffect(() => {
    if (loaded.current || !skills || !templates) return;
    loaded.current = true;
    const ids = new Set(skills.map((s) => s.template_id));
    setPicked(new Set(templates.filter((x) => ids.has(x.id)).map((x) => x.slug)));
  }, [skills, templates]);

  // Skills learned through a journey stay on the list; they can't be untapped here.
  const learned = new Set((skills ?? []).filter((s) => s.source === "journey").map((s) => s.template_id));

  const save = async () => {
    if (!bird || !templates) return;
    setSaving(true);
    setError(null);
    try {
      const slugs = templates.filter((x) => picked.has(x.slug) && !learned.has(x.id)).map((x) => x.slug);
      await setKnownSkills(bird.id, slugs);
      await invalidate();
      void navigate({ to: "/flock/journeys/start", search: { bird: bird.id }, replace: true });
    } catch {
      setError(t("flock.journeys.known.error", "We couldn't save that. Check your connection and try again."));
      setSaving(false);
    }
  };

  return (
    <FlockSubPage title={bird ? t("flock.journeys.known.title", "What does {{name}} already know?", { name: bird.name }) : " "} fallback="/flock/journeys/start">
      <div className="flex flex-col gap-3" data-testid="known-skills">
        {bird && <p className="m-0 text-[14.5px] leading-[1.45]" style={{ color: K.ink }}>{introLine(t, bird.name, birdPronoun(bird.sex))}</p>}
        <div className="flex flex-wrap gap-2">
          {(templates ?? []).map((x) => (
            <ToggleChip key={x.slug} testId={x.slug} label={x.name} on={picked.has(x.slug)}
              onClick={() => { if (learned.has(x.id)) return; setPicked((s) => { const n = new Set(s); if (n.has(x.slug)) n.delete(x.slug); else n.add(x.slug); return n; }); }} />
          ))}
        </div>
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
      <FlowFooter>
        <KyaPrimaryButton onClick={() => void save()} disabled={!bird || saving}>
          {saving ? t("flock.setup.saving", "Saving…") : t("flock.journeys.known.save", "Save {{count}} skills", { count: picked.size })}
        </KyaPrimaryButton>
      </FlowFooter>
    </FlockSubPage>
  );
}
