// The care plan's read screens on the iPhone Duo (lib/duo.ts), on
// DuoSectionReader: the sections as big cards on the left (icon, Ready / To
// finish where there's a status, two lines of what's in it), the open one in a
// pop-out card on the right with previous / next. Each section's body is
// CarePlanView itself, one card at a time (`bare`), so the content is exactly
// what the phone shows. Used by the care plan page (/plan), the read-only care
// plan (/care-plan) and, with its own sitter props, the sitter's care sheet.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Feather, Hand, Heart, Home as HomeIcon, Loader2, Phone, Soup, Sun, Video } from "lucide-react";
import { getHouseholdCarePlanView } from "@/lib/household.functions";
import { useCarePlanStatus, type CarePlanRowKey } from "@/lib/useCarePlanStatus";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { speciesLabel } from "@/lib/speciesLabel";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { ageLabel } from "@/components/BirdPickers";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { dietTypeLabel } from "@/components/careEditors/foodLabels";
import { CarePlanView, carePlanPresence, type CarePlanCard, type CarePlanData, type CareSection } from "@/components/CarePlanView";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { K, KyaLink, KyaSecondaryButton } from "@/components/kya";
import { DUO, DuoMainButton } from "@/components/duo/DuoBlocks";
import { DuoSectionReader, type ReaderSection } from "@/components/duo/DuoSectionReader";
import { PLAN_ROWS } from "@/components/duo/plan/PlanProgress";
import { PaneBack } from "@/components/duo/plan/PaneBack";

// ---- shared pieces ---------------------------------------------------------

export const CARD_ORDER: CarePlanCard[] = ["food", "health", "behavior", "tips", "routine", "home"];

/** The sections a card shows (Your home holds the emergency details). */
export const CARD_SECTIONS: Record<CarePlanCard, CareSection[]> = {
  food: ["food"], health: ["health"], behavior: ["behavior"], tips: ["tips"], routine: ["routine"], home: ["home", "emergency"],
};

export function cardIcon(card: CarePlanCard): ReactNode {
  switch (card) {
    case "food": return <Soup />;
    case "health": return <Heart />;
    case "behavior": return <Hand />;
    case "tips": return <Video />;
    case "routine": return <Sun />;
    case "home": return <HomeIcon />;
  }
}

/** The card titles CarePlanView uses. */
export function cardTitle(t: TFunction, card: CarePlanCard): string {
  switch (card) {
    case "food": return t("carePlan.food", "Food");
    case "health": return t("carePlan.health", "Health");
    case "behavior": return t("carePlan.behavior", "Behavior");
    case "tips": return t("carePlan.tips", "Tips");
    case "routine": return t("carePlan.day", "Day");
    case "home": return t("carePlan.yourHome", "Your home");
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const firstOf = (...vals: unknown[]) => vals.map(str).filter(Boolean).join(" · ");

/** Two lines of what a section holds, for its card on the left. */
export function sectionPreview(t: TFunction, section: CareSection, data: CarePlanData): string | undefined {
  const plan = (data.plan ?? {}) as any;
  const bird = (data.bird ?? {}) as any;
  switch (section) {
    case "food": {
      const diet = ((plan.diet_types ?? []) as string[]).map((d) => dietTypeLabel(t, d)).join(", ");
      return firstOf(diet, plan.food_instructions) || undefined;
    }
    case "health": {
      const w = bird.normal_weight_min && bird.normal_weight_max ? `${bird.normal_weight_min}–${bird.normal_weight_max} g` : bird.normal_weight ? `${bird.normal_weight} g` : "";
      return firstOf(w && t("planDuo.previewWeight", "Normal weight {{weight}}", { weight: w }), plan.whats_normal, bird.medical_conditions) || undefined;
    }
    case "behavior":
      return firstOf(plan.step_up_notes, plan.handlers, plan.likes, plan.handling_rules) || undefined;
    case "tips": {
      const n = (data.watchClips ?? []).length;
      if (!n) return undefined;
      return n === 1 ? t("planDuo.oneClip", "1 clip") : t("planDuo.clipCount", "{{count}} clips", { count: n });
    }
    case "routine": {
      const titles = ((data.tasks ?? []) as any[]).map((x) => str(x.title)).filter(Boolean);
      return titles.slice(0, 4).join(", ") || undefined;
    }
    case "home":
      return firstOf(((plan.hazards ?? []) as string[]).join(", "), plan.cage_location, plan.off_limits, plan.other_pets) || undefined;
    case "emergency": {
      const c = (data.contacts ?? {}) as Record<string, string | null>;
      return firstOf(c.avian_vet_name, c.avian_vet_phone, plan.when_to_call_vet) || undefined;
    }
  }
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>{children}</p>;
}

/** A bird's photo (or its initial) for the top of the left half. */
function BirdBadge({ path, position, name }: { path?: string | null; position?: string | null; name: string }) {
  const photo = useBirdPhotos([path], 400)(path);
  return (
    <span className="relative mb-4 block size-20 shrink-0 overflow-hidden rounded-[22px]" style={{ background: DUO.forest }}>
      {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={position || BIRD_PHOTO_FOCUS} alt="" eager /> : (
        <span aria-hidden="true" className="grid size-full place-items-center text-[26px] font-[700] text-white">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <p className="m-0 flex items-center gap-2 py-6 text-[15px]" style={{ color: K.quiet }}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("carePlanPage.loading", "Loading the care plan…")}
    </p>
  );
}

function usePlanView(birdId: string) {
  const getView = useServerFn(getHouseholdCarePlanView);
  // Same query (and key) as the read-only care plan page.
  return useQuery({
    queryKey: ["household-care-plan", birdId],
    queryFn: () => getView({ data: { birdId } }),
    retry: false,
  });
}

function refreshFrom(refetch: () => Promise<{ data?: any }>) {
  return async (key: string) => {
    const r = await refetch();
    if (key === "baseline") return r.data?.baselineClipUrl ?? null;
    return ((r.data?.watchClips ?? []) as { key: string; url: string }[]).find((x) => x.key === key)?.url ?? null;
  };
}

// ---- /plan: the care plan page ---------------------------------------------

type OverviewRow = CarePlanRowKey;
const OVERVIEW_ROWS: OverviewRow[] = ["details", ...PLAN_ROWS];
const ROW_SECTIONS: Record<Exclude<OverviewRow, "details">, CareSection[]> = {
  food: ["food"], health: ["health"], personality: ["behavior"], clips: ["tips"], day: ["routine"], environment: ["home"], emergency: ["emergency"],
};

function overviewRowTitle(t: TFunction, k: OverviewRow): string {
  switch (k) {
    case "details": return t("planOverview.rowDetails", "Details");
    case "food": return t("planEditor.tabFood", "Food");
    case "health": return t("planEditor.tabHealth", "Health");
    case "personality": return t("planEditor.tabBehavior", "Behavior");
    case "clips": return t("planOverview.rowTips", "Tips");
    case "day": return t("planOverview.rowDay", "Day");
    case "environment": return t("planOverview.rowReminders", "Reminders for your sitter");
    case "emergency": return t("planOverview.rowEmergencyContacts", "Emergency contacts");
  }
}

function overviewRowIcon(k: OverviewRow): ReactNode {
  switch (k) {
    case "details": return <Feather />;
    case "food": return <Soup />;
    case "health": return <Heart />;
    case "personality": return <Hand />;
    case "clips": return <Video />;
    case "day": return <Sun />;
    case "environment": return <HomeIcon />;
    case "emergency": return <Phone />;
  }
}

/** The care plan page on the Duo. The route keeps the navigation: opening a
 *  row's editor, the walkthrough, the sitter preview. */
export function CarePlanOverviewDuo({ birdId, status, canEdit, canPreview, onBack, onOpenRow, onWalkThrough, onViewAsSitter }: {
  birdId: string;
  /** The route's own status sentence ("Two more sections and…"). */
  status: string;
  canEdit: boolean;
  canPreview: boolean;
  onBack: () => void;
  /** The phone's row tap: the editor at that tab (or Details' page). */
  onOpenRow: (k: OverviewRow) => void;
  onWalkThrough: () => void;
  onViewAsSitter: () => void;
}) {
  const { t } = useTranslation();
  const { bird, isDone, todo, loaded, homeIsDifferent, emergencyIsDifferent } = useCarePlanStatus(birdId);
  const { data, isLoading, refetch } = usePlanView(birdId);
  // Opens on the first section still to do, else Food.
  const [selected, setSelected] = useState<OverviewRow | null>(null);
  const open: OverviewRow = selected ?? (loaded ? (todo.find((k) => k !== "details") ?? "food") : "food");
  const name = bird?.name ?? t("planEditor.thisBird", "this bird");
  const view = (data ?? null) as CarePlanData | null;
  const refreshClipUrl = refreshFrom(refetch);

  const body = (k: OverviewRow): ReactNode => {
    if (k === "details") {
      const b = (view?.bird ?? bird ?? {}) as any;
      const rows = [
        [t("planDuo.detailsName", "Name"), b.name],
        [t("planDuo.detailsSpecies", "Species"), b.species ? speciesLabel(t, b.species) : null],
        [t("planDuo.detailsAge", "Age"), b.age ? ageLabel(t, b.age) : null],
      ].filter(([, v]) => !!v) as [string, string][];
      return (
        <dl className="m-0 flex flex-col">
          {rows.map(([l, v], i) => (
            <div key={l} className={`flex items-baseline justify-between gap-4 py-3 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: K.line }}>
              <dt className="text-[14px] font-[700]" style={{ color: K.quiet }}>{l}</dt>
              <dd className="m-0 text-right text-[16px] font-[600]" style={{ color: K.forest }}>{v}</dd>
            </div>
          ))}
        </dl>
      );
    }
    if (isLoading) return <Loading />;
    const sections = ROW_SECTIONS[k];
    const shared = k === "environment" || k === "emergency";
    const different = k === "environment" ? homeIsDifferent : emergencyIsDifferent;
    const has = !!view && sections.some((s) => carePlanPresence(view, { visibleSections: sections }).present[s]);
    return (
      <div className="flex flex-col gap-3">
        {shared && <Quiet>{different ? t("planOverview.differentFor", "Different for {{name}}", { name }) : t("planOverview.shared", "Shared")}</Quiet>}
        {has && view ? (
          <CarePlanView data={view} visibleSections={sections} refreshClipUrl={refreshClipUrl} bare />
        ) : (
          <Quiet>{t("planDuo.nothingYet", "Nothing added here yet.")}</Quiet>
        )}
      </div>
    );
  };

  const sections: ReaderSection[] = OVERVIEW_ROWS.map((k) => ({
    key: k,
    title: overviewRowTitle(t, k),
    icon: overviewRowIcon(k),
    status: loaded
      ? isDone(k) ? { text: t("birdRecord.planReady", "Ready"), tone: "fine" as const } : { text: t("planOverview.tagToFinish", "To finish"), tone: "attention" as const }
      : undefined,
    preview: k === "details"
      ? [bird?.species ? speciesLabel(t, bird.species) : null].filter(Boolean).join(" · ") || undefined
      : view ? ROW_SECTIONS[k].map((s) => sectionPreview(t, s, view)).filter(Boolean).join(" · ") || undefined : undefined,
    body: body(k),
  }));

  const action = canEdit ? (
    <DuoMainButton onClick={() => onOpenRow(open)}>
      {open === "details"
        ? t("planDuo.editDetails", "Edit details")
        : isDone(open) ? t("planDuo.editSection", "Edit this section") : t("planDuo.finishSection", "Finish this section")}
    </DuoMainButton>
  ) : undefined;

  return (
    <DuoSectionReader
      top={<><PaneBack onBack={onBack} /><BirdBadge path={bird?.photo_url} position={bird?.photo_position} name={name} /></>}
      title={t("planOverview.titleNamed", "{{name}}'s care plan", { name })}
      line={loaded ? status : undefined}
      sections={sections}
      selected={open}
      onSelect={(k) => setSelected(k as OverviewRow)}
      action={action}
      secondary={canPreview ? <KyaSecondaryButton className="w-full" onClick={onViewAsSitter}>{t("planOverview.viewAsSitterPill", "View as sitter")}</KyaSecondaryButton> : undefined}
      footer={canEdit ? <KyaLink onClick={onWalkThrough}>{t("planOverview.walkThroughAgain", "Walk through it again")}</KyaLink> : undefined}
      leftExtra={<MemberContextBanner birdId={birdId} />}
    />
  );
}

// ---- /care-plan: the read-only care plan ------------------------------------

/** Which card a ?section= deep link opens. */
export function cardForSection(s?: CareSection): CarePlanCard | undefined {
  if (!s) return undefined;
  return s === "emergency" ? "home" : (s as CarePlanCard);
}

/** The read-only care plan on the Duo: the cards with content, one open. */
export function CarePlanReadDuo({ birdId, section, onSection, canEdit, onBack, onEdit, onSetUpSit }: {
  birdId: string;
  section?: CareSection;
  onSection: (card: CarePlanCard) => void;
  canEdit: boolean;
  onBack: () => void;
  /** Edit the open card's section (the editor at its tab). */
  onEdit: (card: CarePlanCard) => void;
  /** Owner only: set up a sit, which is how a sitter gets the care plan. */
  onSetUpSit?: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = usePlanView(birdId);
  // The photo comes from the bird row (a storage path, signed by useBirdPhotos).
  const { bird: birdRow } = useCarePlanStatus(birdId);
  const view = (data ?? null) as CarePlanData | null;
  const bird = (view?.bird ?? {}) as any;
  const name = (bird.name ?? t("planEditor.thisBird", "this bird")) as string;
  const speciesAge = [bird.species ? speciesLabel(t, bird.species) : null, bird.age ? ageLabel(t, bird.age) : null].filter(Boolean).join(" · ");
  const presence = view ? carePlanPresence(view) : null;
  const cards = CARD_ORDER.filter((c) => presence?.cardPresent[c]);
  const open = cardForSection(section) && cards.includes(cardForSection(section)!) ? cardForSection(section)! : cards[0];
  const refreshClipUrl = refreshFrom(refetch);

  const sections: ReaderSection[] = !view ? [{
    key: "loading",
    title: t("carePlanPage.title", "Care plan"),
    body: isError ? <Quiet>{t("carePlanPage.loadError", "Couldn't load this care plan.")}</Quiet> : isLoading ? <Loading /> : null,
  }] : cards.length === 0 ? [{
    key: "empty",
    title: t("carePlanPage.title", "Care plan"),
    body: <Quiet>{t("planDuo.nothingYet", "Nothing added here yet.")}</Quiet>,
  }] : cards.map((c) => ({
    key: c,
    title: c === "home" ? t("carePlan.yourHome", "Your home") : cardTitle(t, c),
    icon: cardIcon(c),
    preview: CARD_SECTIONS[c].map((s) => sectionPreview(t, s, view)).filter(Boolean).join(" · ") || undefined,
    body: <CarePlanView data={view} visibleSections={CARD_SECTIONS[c]} refreshClipUrl={refreshClipUrl} bare />,
  }));

  return (
    <DuoSectionReader
      top={<><PaneBack onBack={onBack} />{view && <BirdBadge path={birdRow?.photo_url} position={birdRow?.photo_position} name={name} />}</>}
      title={view ? t("planOverview.titleNamed", "{{name}}'s care plan", { name }) : t("carePlanPage.title", "Care plan")}
      line={speciesAge || undefined}
      sections={sections}
      selected={open ?? (view ? "empty" : "loading")}
      onSelect={(k) => onSection(k as CarePlanCard)}
      action={view && onSetUpSit ? <DuoMainButton onClick={onSetUpSit}>{t("planEditor.setUpSitFor", "Set up a sit for {{name}}", { name })}</DuoMainButton> : undefined}
      secondary={view && canEdit ? <KyaSecondaryButton className="w-full" onClick={() => onEdit(open ?? "food")}>{open ? t("planDuo.editSection", "Edit this section") : t("carePlan.editCarePlan", "Edit care plan")}</KyaSecondaryButton> : undefined}
      footer={view && !canEdit ? <p className="m-0 text-[13px]" style={{ color: K.quiet }}>{t("carePlanPage.readOnlyFooter", "Read-only. Only {{name}}'s owner can make changes.", { name })}</p> : undefined}
      leftExtra={<MemberContextBanner birdId={birdId} />}
    />
  );
}
