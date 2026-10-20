import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { useCarePlanStatus, CARE_PLAN_ROWS, CARE_PLAN_HOME_ROWS, type CarePlanRowKey } from "@/lib/useCarePlanStatus";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { track } from "@/lib/analytics";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { speciesLabel } from "@/lib/speciesLabel";
import { setupStepNumber, type SetupStepKey } from "@/lib/setupSteps";
import { S, SERIF, SetupPrimaryButton } from "@/components/setup/controls";
import {
  ChevronLeft, Feather, Soup, Heart, Hand, Video, Sun, Home as HomeIcon, Phone, Wand2,
} from "lucide-react";

// Care-plan overview — the front door an owner sees when they tap "Care plan"
// on the bird main page. Lists the six care-plan sections with completion
// status; tapping a section opens it in the existing tabbed editor.
// "Walk through it again" launches the guided wizard with answers prefilled.
// Per design: page #f4f1e8, white section list card, sentence case, AA contrast.
//
// This is the INDEX of the /plan route. The sibling /plan/editor renders into
// the plan layout's <Outlet/> (src/routes/_authenticated/birds/$birdId.plan.tsx)
// — an index/layout split so the editor is a real child route, not nested under
// this page (which has no Outlet, so the editor never rendered before).
export const Route = createFileRoute("/_authenticated/birds/$birdId/plan/")({
  head: () => ({ meta: [{ title: i18next.t("planEditor.metaTitle", "Care plan — Kya & Co.") }] }),
  component: CarePlanOverview,
});

type SectionKey = "food" | "day" | "personality" | "environment" | "health" | "emergency";

// Maps an overview row to the read-only care-plan's anchor id so a member who
// can't edit deep-links straight to that section (?section=) instead of the top.
const READ_SECTION: Record<SectionKey, "food" | "behavior" | "home" | "health" | "routine" | "emergency"> = {
  food: "food", personality: "behavior", environment: "home", health: "health", day: "routine", emergency: "emergency",
};

// The six rows of the "Care plan" card, in flow order, and the two "Your
// home" rows. Each opens its editor tab (or, without edit access, the
// read-only plan at that section).
type RowKey = CarePlanRowKey;
const EDITOR_TAB: Record<Exclude<RowKey, "details">, "food" | "routine" | "behavior" | "home" | "health" | "emergency" | "clips"> = {
  food: "food", health: "health", personality: "behavior", clips: "clips", day: "routine", environment: "home", emergency: "emergency",
};

function rowLabel(t: TFunction, k: RowKey): string {
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

function rowIcon(k: RowKey) {
  const cls = "size-5";
  switch (k) {
    case "details": return <Feather className={cls} aria-hidden="true" />;
    case "food": return <Soup className={cls} aria-hidden="true" />;
    case "health": return <Heart className={cls} aria-hidden="true" />;
    case "personality": return <Hand className={cls} aria-hidden="true" />;
    case "clips": return <Video className={cls} aria-hidden="true" />;
    case "day": return <Sun className={cls} aria-hidden="true" />;
    case "environment": return <HomeIcon className={cls} aria-hidden="true" />;
    case "emergency": return <Phone className={cls} aria-hidden="true" />;
  }
}

/** "Three" for 3: the start of the status sentence. */
function countWord(t: TFunction, n: number): string {
  switch (n) {
    case 2: return t("planOverview.num2", "Two");
    case 3: return t("planOverview.num3", "Three");
    case 4: return t("planOverview.num4", "Four");
    case 5: return t("planOverview.num5", "Five");
    case 6: return t("planOverview.num6", "Six");
    case 7: return t("planOverview.num7", "Seven");
    default: return String(n);
  }
}

function CarePlanOverview() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  // Edit access is capability-based now: owner OR a member with edit_care_plans
  // can open the section editor; everyone else sees the read-only care plan.
  const canEdit = useCapability("edit_care_plans", { birdId });
  const isOwner = role === "owner";

  const { bird, isDone, todo, homeIsDifferent, emergencyIsDifferent } = useCarePlanStatus(birdId);

  useEffect(() => {
    track("care_plan_viewed", {});
  }, []);

  const name = bird?.name ?? t("planEditor.thisBird", "this bird");
  const photoOf = useBirdPhotos([bird?.photo_url], 256);
  const photo = photoOf(bird?.photo_url);

  const status = todo.length === 0
    ? t("planOverview.statusDone", "{{name}}'s plan has everything a sitter needs.", { name })
    : todo.length === 1
      ? t("planOverview.statusOne", "One more section and {{name}}'s plan will have everything a sitter needs.", { name })
      : t("planOverview.statusMany", "{{words}} more sections and {{name}}'s plan will have everything a sitter needs.", { words: countWord(t, todo.length), name });
  // The button picks up at the first section still to do, in flow order.
  const firstTodo = todo.find((k) => k !== "details");

  function openRow(k: RowKey) {
    if (k === "details") { navigate({ to: "/birds/$birdId/identity", params: { birdId } }); return; }
    if (canEdit) {
      track("care_plan_editor_opened", { tab: EDITOR_TAB[k], section_ready: isDone(k) });
      navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: EDITOR_TAB[k] } });
    } else if (k === "clips") {
      navigate({ to: "/birds/$birdId/care-plan", params: { birdId } });
    } else {
      navigate({ to: "/birds/$birdId/care-plan", params: { birdId }, search: { section: READ_SECTION[k as SectionKey] } });
    }
  }

  const tag = (k: RowKey) => {
    if (isDone(k)) {
      return <span className="shrink-0 rounded-full px-[10px] py-[5px] text-[12px] font-[700] leading-none" style={{ background: S.forest, color: S.lime }}>{t("planOverview.tagDone", "Done")}</span>;
    }
    if (k === "emergency") {
      return <span className="shrink-0 rounded-full border-2 border-dashed px-[9px] py-[3px] text-[12px] font-[700]" style={{ borderColor: S.amberText, color: S.amberText }}>{t("planOverview.tagNeededForSit", "Needed for a sit")}</span>;
    }
    return <span className="shrink-0 rounded-full border-2 border-dashed px-[9px] py-[3px] text-[12px] font-[700]" style={{ borderColor: "#b9b19a", color: S.helper }}>{t("planOverview.tagToDo", "To do")}</span>;
  };

  const row = (k: RowKey, i: number) => {
    const shared = k === "environment" || k === "emergency";
    const different = k === "environment" ? homeIsDifferent : emergencyIsDifferent;
    return (
      <li key={k} className={i > 0 ? "border-t border-[#e3ebe2]" : ""}>
        <button type="button" onClick={() => openRow(k)} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left" style={{ color: S.forest }}>
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: i % 2 === 0 ? S.lime : "#9bcab8", color: S.forest }}>{rowIcon(k)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-[700]">{rowLabel(t, k)}</span>
            {shared && (
              <span className="block text-[13.5px]" style={{ color: S.helper }}>
                {different ? t("planOverview.differentFor", "Different for {{name}}", { name }) : t("planOverview.shared", "Shared")}
              </span>
            )}
          </span>
          {tag(k)}
        </button>
      </li>
    );
  };

  return (
    <div className="min-h-screen pb-nav" style={{ background: S.card }}>
      <div className="mx-auto max-w-md">
        <header className="rounded-b-[26px] px-4 pb-6 pt-[max(env(safe-area-inset-top),14px)] text-white" style={{ background: S.forest }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full pl-2.5 pr-4 text-[15px] font-[700] text-white"
              style={{ background: S.forestDeep }}
            >
              <ChevronLeft className="size-5" aria-hidden="true" /> {t("planOverview.birds", "Birds")}
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => navigate({ to: "/birds/$birdId/view-as-sitter", params: { birdId } })}
                className="inline-flex min-h-[44px] items-center px-1 text-[15px] font-[700]"
                style={{ color: S.lime }}
              >
                {t("planOverview.viewAsYourSitter", "View as your sitter")}
              </button>
            )}
          </div>

          <div className="mt-5 flex items-center gap-4">
            {photo?.url ? (
              <div className="size-[76px] shrink-0 overflow-hidden rounded-full">
                <BirdPhotoCrop url={photo.url} original={photo.original} position={bird?.photo_position} alt={name} />
              </div>
            ) : (
              <span className="grid size-[76px] shrink-0 place-items-center rounded-full text-[34px] font-[700]" style={{ background: S.lime, color: S.forest, fontFamily: SERIF }} aria-hidden="true">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="m-0 truncate text-[34px] font-[700] leading-[1.06] tracking-[-0.02em]" style={{ fontFamily: SERIF }}>{name}</h1>
              {bird?.species && <p className="m-0 mt-1 text-[15px]" style={{ color: S.mist }}>{speciesLabel(t, bird.species)}</p>}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[16px] p-4" style={{ background: S.forestDeep }}>
            <p className="m-0 text-[16px] leading-[1.45] text-white">{status}</p>
            {canEdit && firstTodo && (
              <SetupPrimaryButton onClick={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: setupStepNumber(firstTodo as SetupStepKey) } })}>
                {t("birdRecord.addSitterDetails", "Add pet-sitter details")}
              </SetupPrimaryButton>
            )}
          </div>
        </header>

        <main className="flex flex-col gap-[14px] px-4 pt-5">
          <MemberContextBanner birdId={birdId} />
          <section className="rounded-[20px] bg-white px-4 py-3" style={{ color: S.forest }}>
            <h2 className="m-0 pt-1 text-[21px] font-[700]" style={{ fontFamily: SERIF }}>{t("planOverview.cardCarePlan", "Care plan")}</h2>
            <ul className="m-0 mt-1 list-none p-0">{CARE_PLAN_ROWS.map(row)}</ul>
          </section>
          <section className="rounded-[20px] bg-white px-4 py-3" style={{ color: S.forest }}>
            <h2 className="m-0 pt-1 text-[21px] font-[700]" style={{ fontFamily: SERIF }}>{t("planOverview.cardYourHome", "Your home")}</h2>
            <ul className="m-0 mt-1 list-none p-0">{CARE_PLAN_HOME_ROWS.map(row)}</ul>
          </section>

          {canEdit && (
            <button
              type="button"
              onClick={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: 1 } })}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-[15px] font-[700]"
              style={{ color: S.moss }}
            >
              <Wand2 className="size-4" aria-hidden="true" /> {t("planOverview.walkThroughAgain", "Walk through it again")}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
