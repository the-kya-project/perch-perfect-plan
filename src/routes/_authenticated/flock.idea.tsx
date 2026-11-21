import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Lightbulb, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { categoryLabel, outcomeLabel } from "@/components/flock/IdeaParts";
import { AvatarError } from "@/lib/flockAvatar";
import { useOwnBirdPhotoUrls } from "@/lib/flockData";
import { IDEA_OUTCOMES, pluralSpecies, tryIdea, useIdeaPhotos, useInvalidateIdeas, useTodaysIdea, type IdeaOutcome } from "@/lib/flockIdeas";
import { discardPostPhotos, uploadPostPhoto } from "@/lib/flockPostData";
import { useJourneyBirds } from "@/lib/journeyData";
import { birdPronoun } from "@/lib/journeys";

// We tried it (Batch 2, screen 5): one tap for how your bird did, an optional
// photo, then every bird that tried it today and how it went. The numbers
// show from 5 answers.
export const Route = createFileRoute("/_authenticated/flock/idea")({
  component: WeTriedIt,
});

function WeTriedIt() {
  const { t } = useTranslation();
  const invalidate = useInvalidateIdeas();
  const { data: idea, isLoading } = useTodaysIdea();
  const { data: birds } = useJourneyBirds();
  const { data: birdPhotos } = useOwnBirdPhotoUrls(birds ?? [], 120);
  const { data: photos } = useIdeaPhotos(idea?.idea_id, !!idea && (idea.has_photo || idea.photo_count > 0 || !!idea.my_outcome));
  const [birdId, setBirdId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<IdeaOutcome | null>(null);
  const [photo, setPhoto] = useState<{ preview: string; path: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <FlockSubPage title={t("flock.idea.title", "Today's idea")} fallback="/flock">{null}</FlockSubPage>;
  if (!idea) {
    return (
      <FlockSubPage title={t("flock.idea.title", "Today's idea")} fallback="/flock">
        <FlockEmpty icon={<Lightbulb className="size-6" />} title={t("flock.idea.noneTitle", "No idea today")}>
          {t("flock.idea.none", "Check back tomorrow for something new to try with your bird.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const list = birds ?? [];
  const chosen = list.find((b) => b.id === (birdId ?? idea.my_bird_id)) ?? list[0] ?? null;
  const pronoun = birdPronoun(chosen?.sex);
  const answered = !!idea.my_outcome && !editing;
  const current = outcome ?? idea.my_outcome;
  const ideaPhoto = photos?.find((p) => p.kind === "idea");
  const tries = (photos ?? []).filter((p) => p.kind === "try");

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhoto({ preview: URL.createObjectURL(f), path: null });
    try { const path = await uploadPostPhoto(f); setPhoto((p) => (p ? { ...p, path } : p)); }
    catch (e) { setPhoto(null); setError(e instanceof AvatarError ? e.message : t("flock.posts.photoError", "We couldn't add that photo. Try again.")); }
  };
  const save = async () => {
    if (!current) return;
    setBusy(true); setError(null);
    try {
      await tryIdea(idea.idea_id, current, chosen?.id ?? null, photo?.path ?? null);
      setEditing(false); setPhoto(null); setOutcome(null);
      await invalidate();
    } catch {
      setError(t("flock.idea.saveError", "We couldn't save that. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlockSubPage title={t("flock.idea.title", "Today's idea")} line={categoryLabel(t, idea.category)} fallback="/flock">
      <div className="flex flex-col gap-4" data-testid="idea-page">
        <article className="flex flex-col gap-2 rounded-[18px] bg-white p-4" style={{ color: K.forest }}>
          <span className="text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }}>
            {idea.my_outcome ? t("flock.idea.youTried", "Today's idea · you tried it") : t("flock.idea.labelShort", "Today's idea")}
          </span>
          <KyaHeading size={22} as="h2">{idea.title}</KyaHeading>
          <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.5]" style={{ color: K.ink }}>{idea.body}</p>
          {ideaPhoto && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-[14px]" style={{ background: K.mist }}>
              <img src={ideaPhoto.url} alt="" className="absolute inset-0 size-full object-cover" />
            </div>
          )}
        </article>

        {answered ? (
          <section className="flex items-center gap-3 rounded-[18px] bg-white p-4" data-testid="my-answer">
            {chosen && <BirdThumb name={chosen.name} photo={birdPhotos[chosen.id]} size={40} />}
            <span className="flex-1 text-[15px]" style={{ color: K.ink }}>
              {t("flock.idea.yourAnswer", "{{bird}}: {{outcome}}", { bird: chosen?.name ?? "", outcome: outcomeLabel(t, idea.my_outcome!, pronoun) })}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="min-h-[40px] text-[14px] font-[700]" style={{ color: K.moss }}>{t("flock.posts.change", "Change")}</button>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4" data-testid="how-did">
            {list.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("flock.idea.whichBird", "Which bird?")}>
                {list.map((b) => (
                  <button key={b.id} type="button" aria-pressed={chosen?.id === b.id} onClick={() => setBirdId(b.id)} data-bird={b.id}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[14px] font-[700]"
                    style={chosen?.id === b.id ? { background: K.lime, border: `2px solid ${K.forest}` } : { background: "#fff", border: "1px solid #c9d3c8" }}>
                    <BirdThumb name={b.name} photo={birdPhotos[b.id]} size={28} />{b.name}
                  </button>
                ))}
              </div>
            )}
            <KyaHeading size={19} as="h3">{t("flock.idea.howDid", "How did {{bird}} do?", { bird: chosen?.name ?? t("flock.idea.yourBird", "your bird") })}</KyaHeading>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("flock.idea.howDidAria", "How it went")}>
              {IDEA_OUTCOMES.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={current === o} data-outcome={o} onClick={() => setOutcome(o)}
                  className="min-h-[52px] rounded-[14px] px-2 text-[14.5px] font-[700]"
                  style={current === o ? { background: K.lime, border: `2px solid ${K.forest}`, color: K.forest } : { background: K.mist, border: "2px solid transparent", color: K.forest }}>
                  {outcomeLabel(t, o, pronoun)}
                </button>
              ))}
            </div>
            {photo ? (
              <div className="relative size-24 overflow-hidden rounded-[12px]">
                <img src={photo.preview} alt="" className="size-full object-cover" style={{ opacity: photo.path ? 1 : 0.5 }} />
                <button type="button" onClick={() => { if (photo.path) void discardPostPhotos([photo.path]); setPhoto(null); }}
                  aria-label={t("flock.posts.removePhoto", "Remove photo")} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" aria-hidden="true" /></button>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} data-testid="idea-photo"
                  className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full border px-4 text-[14px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest }}>
                  <Camera className="size-4" aria-hidden="true" />{t("flock.idea.addPhoto", "Add a photo (optional)")}
                </button>
              </>
            )}
            <p className="m-0 text-[13px]" style={{ color: K.quiet }}>{t("flock.posts.gpsNote", "Photos lose their location data when you post.")}</p>
            {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
            <KyaPrimaryButton onClick={() => void save()} disabled={!current || busy || (!!photo && !photo.path)}>
              {busy ? t("flock.idea.saving", "Saving…") : t("flock.idea.save", "Share how it went")}
            </KyaPrimaryButton>
          </section>
        )}

        {idea.my_outcome && (
          <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4" data-testid="idea-tally" style={{ color: K.forest }}>
            {idea.tried != null ? (
              <>
                <KyaHeading size={20} as="h3">{t("flock.idea.tried", "{{count}} birds tried it today", { count: idea.tried })}</KyaHeading>
                {idea.loved_pct != null && <p className="m-0 text-[16px] font-[700]">{t("flock.idea.lovedPct", "{{pct}}% loved it.", { pct: idea.loved_pct })}</p>}
                {idea.top_species && idea.top_species.length > 0 && (
                  <p className="m-0 text-[15px]" style={{ color: K.ink }}>
                    {t("flock.idea.popular", "Most popular with {{species}}.", { species: idea.top_species.map(pluralSpecies).join(t("flock.idea.and", " and ")) })}
                  </p>
                )}
              </>
            ) : (
              <p className="m-0 text-[15px]" style={{ color: K.ink }} data-testid="tally-soon">
                {t("flock.idea.tallySoon", "Once five birds have tried it, you'll see how everyone did.")}
              </p>
            )}
            {tries.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5" data-testid="idea-photos">
                {tries.map((p) => (
                  <figure key={p.id} className="relative m-0 aspect-square overflow-hidden rounded-[10px]" style={{ background: K.mist }}>
                    <img src={p.url} alt={p.bird_name ?? ""} loading="lazy" className="absolute inset-0 size-full object-cover" />
                    {p.bird_name && (
                      <figcaption className="absolute inset-x-0 bottom-0 truncate px-1.5 pb-1 pt-4 text-[11.5px] font-[700] text-white" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.55))" }}>
                        {p.bird_name}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </FlockSubPage>
  );
}
