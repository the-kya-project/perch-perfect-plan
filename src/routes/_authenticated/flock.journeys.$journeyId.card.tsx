import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaSwitch } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { useMyProfile, useOwnBirdPhotoUrls, type FlockPhotoSrc } from "@/lib/flockData";
import { useJourney, useJourneyBirds, useJourneyUpdates, useJourneyView, useJourneyViewUpdates } from "@/lib/journeyData";
import { getJourneyCardPhotos } from "@/lib/journeyMedia.functions";
import { possessive, skillInSentence } from "@/lib/journeys";
import { CARD_SIZES, canMakeJourneyCard, cardFileName, renderJourneyCard, type CardKind, type CardSize, type CardText } from "@/lib/journeyCard";
import { canShareImageFiles, shareOrSaveImage } from "@/lib/momentCard";

// Share card (backlog 1.7, SpecShareCards screens 2 and 3): a preview of the
// card in post (1080×1350) or story (1080×1920) size, the bird's name on by
// default, the member's name off unless they add it, then Share (the share
// sheet, or a download where the browser can't share files). Made only by
// the bird's household: a milestone or a finish is read through the
// household-only journeys table, and day one vs. now's stills come from
// getJourneyCardPhotos, which checks is_mine.
type CardSearch = { kind: CardKind; u?: string; a?: string; b?: string };

export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/card")({
  validateSearch: (s: Record<string, unknown>): CardSearch => ({
    kind: s.kind === "finished" || s.kind === "compare" ? s.kind : "moment",
    u: typeof s.u === "string" ? s.u : undefined,
    a: typeof s.a === "string" ? s.a : undefined,
    b: typeof s.b === "string" ? s.b : undefined,
  }),
  component: ShareCard,
});

const photoUrl = (src: FlockPhotoSrc): string | null => (typeof src === "string" ? src : src?.url ?? null);

function ShareCard() {
  const { t, i18n } = useTranslation();
  const { journeyId } = Route.useParams();
  const { kind, u, a, b } = Route.useSearch();
  const compare = kind === "compare";
  const { data: journey, isFetched: journeyFetched } = useJourney(compare ? "" : journeyId);
  const { data: ownUpdates, isFetched: ownUpdatesFetched } = useJourneyUpdates(kind === "moment" ? journeyId : "");
  const { data: birds } = useJourneyBirds();
  const { data: view, isFetched: viewFetched } = useJourneyView(compare ? journeyId : "");
  const { data: updates } = useJourneyViewUpdates(compare ? journeyId : "");
  const { data: profile } = useMyProfile();
  const birdId = compare ? view?.bird_id : journey?.bird_id;
  const bird = birds?.find((x) => x.id === birdId);
  const { data: birdPhotos } = useOwnBirdPhotoUrls(bird && !compare ? [bird] : undefined, 1080);
  const pair = [a, b].filter((x): x is string => !!x);
  const { data: stills } = useQuery({
    queryKey: ["flock", "journeys", "card-photos", journeyId, pair.join(",")],
    enabled: compare && !!view?.is_mine && pair.length === 2,
    staleTime: 5 * 60_000,
    queryFn: () => getJourneyCardPhotos({ data: { cardJourneyId: journeyId, updateIds: pair } }),
  });

  const [size, setSize] = useState<CardSize>(compare ? "story" : "post");
  const [showBird, setShowBird] = useState(true);
  const [showMe, setShowMe] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(true);
  useEffect(() => { setCanShare(canShareImageFiles()); }, []);

  const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { month: "short", day: "numeric" }) : null);
  const birdName = bird?.name ?? view?.bird_name ?? "";
  const member = showMe && profile?.display_name ? t("flock.journeys.shareCard.from", "From {{name}}", { name: profile.display_name }) : null;

  // What the card says, or null while it loads (or when there's nothing to make).
  let card: { text: CardText; photos: (string | null)[]; skill: string } | null = null;
  let allowed = false;
  if (!compare && journey && bird) {
    allowed = canMakeJourneyCard({ kind, isMine: true });
    const skill = journey.template?.name ?? journey.custom_name ?? "";
    const photos = [photoUrl(birdPhotos[bird.id])];
    if (kind === "finished") {
      card = {
        skill, photos, text: {
          eyebrow: t("flock.journeys.shareCard.finishedEyebrow", "{{skill}} · Finished!", { skill }),
          title: showBird
            ? t("flock.journeys.shareCard.finishedTitle", "{{name}} learned {{skill}}", { name: birdName, skill: skillInSentence(skill) })
            : t("flock.journeys.shareCard.finishedTitleNoName", "Learned {{skill}}", { skill: skillInSentence(skill) }),
          date: journey.finished_at ? t("flock.journeys.shareCard.finishedOn", "Finished {{date}}", { date: day(journey.finished_at) }) : null,
          member,
        },
      };
    } else {
      // A big moment: an update on this journey marked "This was a big moment".
      const m = ownUpdates?.find((x) => x.id === u && x.is_big_moment);
      if (m) {
        card = {
          skill, photos, text: {
            eyebrow: t("flock.journeys.shareCard.momentEyebrow", "{{skill}} · big moment", { skill }),
            title: showBird
              ? t("flock.journeys.shareCard.momentTitle", "A big moment for {{name}}!", { name: birdName })
              : t("flock.journeys.shareCard.momentTitleNoName", "A big moment!"),
            date: day(m.created_at),
            member,
          },
        };
      }
    }
  } else if (compare && view && updates) {
    const left = updates.find((u) => u.update_id === a);
    const right = updates.find((u) => u.update_id === b);
    allowed = canMakeJourneyCard({ kind, isMine: view.is_mine, comparePhotos: left && right ? 2 : 0 });
    if (allowed && left && right && stills) {
      card = {
        skill: view.skill, photos: [stills[left.update_id] ?? null, stills[right.update_id] ?? null], text: {
          eyebrow: view.finished_at
            ? t("flock.journeys.shareCard.compareEyebrowFinished", "{{skill}} · finished", { skill: view.skill })
            : view.skill,
          title: showBird
            ? t("flock.journeys.shareCard.compareTitle", "{{name}}, day one and now", { name: birdName })
            : t("flock.journeys.shareCard.compareTitleNoName", "Day one and now"),
          photoDates: [day(left.created_at) ?? "", day(right.created_at) ?? ""],
          member,
        },
      };
    }
  }
  const key = card ? JSON.stringify([size, card.text, card.photos.map((p) => (p ? `${p.length}:${p.slice(-80)}` : null))]) : "";

  useEffect(() => {
    if (!card) return;
    let gone = false;
    let url: string | null = null;
    setFailed(false);
    renderJourneyCard({ kind, size, photos: card.photos, text: card.text })
      .then((made) => {
        if (gone) return;
        url = URL.createObjectURL(made);
        setBlob(made);
        setPreview(url);
      })
      .catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
    // The key holds everything the card is drawn from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const share = async () => {
    if (!blob || !card) return;
    setNote(null);
    try {
      const r = await shareOrSaveImage(blob, cardFileName([showBird ? birdName : null, card.skill], size), card.text.title);
      if (r === "saved") setNote(t("flock.journeys.shareCard.saved", "The card is in your downloads, ready to post."));
    } catch (e: any) {
      if (e?.name !== "AbortError") setNote(t("flock.journeys.shareCard.failed", "We couldn't make the card. Try again in a moment."));
    }
  };

  // Nothing to make: not the household's journey, an update that isn't a big
  // moment, or day one vs. now without both clips.
  const nothing = compare
    ? viewFetched && (!view || (!!updates && !allowed))
    : journeyFetched && !!birds && (kind !== "moment" || ownUpdatesFetched) && !card;
  const { w, h } = CARD_SIZES[size];
  const chip = (s: CardSize, label: string) => (
    <button type="button" onClick={() => setSize(s)} aria-pressed={size === s} data-testid={`card-size-${s}`}
      className="min-h-[40px] rounded-full px-3.5 text-[13.5px] font-[700]"
      style={size === s ? { background: K.forest, color: "#fff" } : { background: "#fff", color: K.forest, border: "1px solid #c9d3c8" }}>{label}</button>
  );
  const toggle = (label: string, on: boolean, set: (v: boolean) => void, testId: string) => (
    <div className="flex min-h-[52px] items-center gap-3 px-4" data-testid={testId}>
      <span className="min-w-0 flex-1 text-[15px] font-[700]">{label}</span>
      <KyaSwitch checked={on} onChange={set} label={label} />
    </div>
  );

  return (
    <FlockSubPage title={t("flock.journeys.shareCard.title", "Share card")} fallback={`/flock/journeys/${journeyId}`}>
      {nothing ? (
        <p className="m-0 rounded-[16px] bg-white p-4 text-[15px] leading-[1.45]" style={{ color: K.ink }} data-testid="card-unavailable">
          {t("flock.journeys.shareCard.unavailable", "A share card can be made only for your own birds' journeys.")}
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="share-card" data-kind={kind} data-size={size}>
          <div className="flex gap-2">
            {chip("post", t("flock.journeys.shareCard.post", "Post"))}
            {chip("story", t("flock.journeys.shareCard.story", "Story"))}
          </div>
          <div className="self-center overflow-hidden rounded-[16px]" style={{ width: size === "post" ? 280 : 250, aspectRatio: `${w} / ${h}`, background: K.forest }}>
            {preview && !failed
              ? <img src={preview} alt={card?.text.title ?? ""} className="block size-full" data-testid="card-preview" />
              : failed && <p role="alert" className="m-0 p-4 text-[14px] text-white">{t("flock.journeys.shareCard.failed", "We couldn't make the card. Try again in a moment.")}</p>}
          </div>
          <KyaCard>
            {toggle(t("flock.journeys.shareCard.showBird", "Show {{name}} name", { name: possessive(birdName) }), showBird, setShowBird, "card-show-bird")}
            {profile?.display_name && (
              <div style={{ borderTop: `1px solid ${K.line}` }}>{toggle(t("flock.journeys.shareCard.addMe", "Add my name"), showMe, setShowMe, "card-add-me")}</div>
            )}
          </KyaCard>
          <button type="button" onClick={() => void share()} disabled={!blob || failed} data-testid="card-share"
            className="min-h-[48px] w-full rounded-full text-[15px] font-[700] text-white disabled:opacity-45" style={{ background: K.forest }}>
            {t("flock.journeys.shareCard.share", "Share")}
          </button>
          {!canShare && (
            <p className="m-0 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>
              {t("flock.journeys.shareCard.webHint", "On the web, this downloads the image so you can post it.")}
            </p>
          )}
          {note && <p role="status" className="m-0 text-[14px]" style={{ color: K.ink }} data-testid="card-note">{note}</p>}
        </div>
      )}
    </FlockSubPage>
  );
}
