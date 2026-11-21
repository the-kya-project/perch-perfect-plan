import { useState } from "react";
import { birdNames } from "@/lib/birdNames";
import { useServerFn } from "@tanstack/react-start";
import { addExistingHouseholdMember } from "@/lib/household.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InSetupFrame, SetupFrame, SETUP_PILLS } from "@/components/setup/SetupFrame";
import { useDuoMode } from "@/lib/duo";
import { RailClose } from "@/components/DuoRail";
import { KyaLink } from "@/components/kya";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard } from "@/components/duo/DuoBlocks";
import { FlowHeading } from "@/components/duo/flows/FlowParts";
import { CheckRow, S, SetupPrimaryButton, SetupTextButton } from "@/components/setup/controls";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// One person from getHouseholdAccount().members, narrowed to what this sheet
// needs. `scope` is DERIVED there (birdIds.length >= totalBirds), not stored —
// so it is only meaningful when the account was fetched BEFORE the new bird was
// inserted. new.tsx snapshots it at that moment and passes it down; don't
// refetch here or everyone with "all" collapses to "scoped" (they'd hold n of
// n+1 birds) and nothing would pre-check.
export type ShareCandidate = {
  userId: string;
  name: string | null;
  email: string | null;
  birdNames: string[];
  scope: "all" | "scoped";
};

function memberLabel(m: ShareCandidate) {
  return m.name?.trim() || m.email || i18next.t("shareNewBird.householdMember", "Household member");
}

// Details · 2 of 2, asked right after a bird is created and only when the owner
// has household members. The bird is ALREADY SAVED by the time this renders —
// Not now and Continue both go on to Food, and a failed grant is reported but
// never blocks the care plan. Back leaves setup for the bird's page.
export function ShareNewBirdStep({
  birdName,
  members,
  birdId,
  onContinue,
  onBack,
}: {
  birdName: string;
  members: ShareCandidate[];
  birdId: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  // Pre-check anyone who could see every bird that existed before this one —
  // keeping them is the intent-preserving default. People already scoped to
  // specific birds stay unchecked; that scoping was deliberate.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.scope === "all").map((m) => m.userId)),
  );
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const addExisting = useServerFn(addExistingHouseholdMember);
  const duo = useDuoMode() === "sideways";

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function onShare() {
    if (sharing) return;
    const picked = members.filter((m) => selected.has(m.userId));
    if (!picked.length) { onContinue(); return; }
    setSharing(true);
    // allSettled, not all: one person's failure must not cancel the rest, and
    // must not strand the owner short of the care plan.
    const results = await Promise.allSettled(
      picked.map((m) => addExisting({ data: { birdId, userId: m.userId } })),
    );
    const failed = picked.filter((_, i) => results[i].status === "rejected");
    const shared = picked.filter((_, i) => results[i].status === "fulfilled");
    if (shared.length) {
      toast.success(
        shared.length === 1
          ? t("shareNewBird.oneCanSee", "{{name}} can see {{bird}}.", { name: memberLabel(shared[0]), bird: birdName })
          : t("shareNewBird.manyCanSee", "{{n}} people can see {{bird}}.", { n: shared.length, bird: birdName }),
      );
    }
    if (failed.length) {
      // Name who failed — "something went wrong" leaves the owner unable to
      // tell who still needs access.
      toast.error(t("shareNewBird.shareFailed", "Couldn't share {{bird}} with {{names}}. You can add them from Household.", { bird: birdName, names: failed.map(memberLabel).join(", ") }));
    }
    onContinue();
  }

  const title = t("shareNewBird.titleNamed", "Who else helps with {{bird}}?", { bird: birdName });
  const intro = t("shareNewBird.intro", "{{bird}} is saved. These people help with your other birds — pick anyone who should see {{bird}} too.", { bird: birdName });
  const mainLabel = selected.size ? t("shareNewBird.shareAndContinue", "Share and continue") : t("shareNewBird.continue", "Continue");
  const list = (
    <>
      <div className="flex flex-col gap-2.5">
        {members.map((m) => {
          const label = memberLabel(m);
          return (
            <CheckRow
              key={m.userId}
              on={selected.has(m.userId)}
              onClick={() => toggle(m.userId)}
              disabled={sharing}
              leading={
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-[17px] font-[700]" style={{ background: S.forest, color: S.lime }}>
                  {(label.slice(0, 1) || "?").toUpperCase()}
                </span>
              }
              title={label}
              detail={m.scope === "all" ? t("shareNewBird.helpsWithAll", "Helps with all your birds") : t("shareNewBird.helpsWith", "Helps with {{names}}", { names: birdNames(t, m.birdNames) })}
            />
          );
        })}
      </div>
      <p className="m-0 px-1 text-[14.5px] leading-[1.5]" style={{ color: S.quiet }}>
        {t("shareNewBird.changeAnytime", "You can change who sees {{bird}} anytime from Household.", { bird: birdName })}
      </p>
    </>
  );

  // iPhone Duo, sideways: the people on the left, who will see the bird on the
  // right with the one main button.
  if (duo) {
    const picked = members.filter((m) => selected.has(m.userId));
    return (
      <DuoTwoPane
        leftLabel={title}
        rightLabel={t("shareNewBirdDuo.whoSees", "Who will see {{bird}}", { bird: birdName })}
        left={
          <>
            <RailClose onClose={onBack} />
            <FlowHeading eyebrow={t("setupShell.stepOf", "Step {{step}} of {{total}}", { step: 1, total: SETUP_PILLS.length })} title={title} line={intro} />
            <InSetupFrame.Provider value={true}><div className="mt-6 flex flex-col gap-[14px]">{list}</div></InSetupFrame.Provider>
          </>
        }
        right={
          <PopOutCard
            eyebrow={birdName}
            title={t("shareNewBirdDuo.whoSees", "Who will see {{bird}}", { bird: birdName })}
            action={
              <DuoMainButton disabled={sharing} onClick={onShare}>
                {sharing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {mainLabel}<span aria-hidden="true">→</span>
              </DuoMainButton>
            }
            footer={<KyaLink onClick={sharing ? undefined : onContinue}>{t("shareNewBird.notNow", "Not now")}</KyaLink>}
          >
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              <li className="flex min-h-[56px] items-center gap-3 rounded-[18px] px-3" style={{ background: DUO.bg }}>
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-[17px] font-[700]" style={{ background: S.forest, color: S.lime }}>
                  {(t("shareNewBirdDuo.you", "You").slice(0, 1)).toUpperCase()}
                </span>
                <span className="text-[16px] font-[700]">{t("shareNewBirdDuo.you", "You")}</span>
              </li>
              {picked.map((m) => {
                const label = memberLabel(m);
                return (
                  <li key={m.userId} className="flex min-h-[56px] items-center gap-3 rounded-[18px] px-3" style={{ background: DUO.bg }}>
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-[17px] font-[700]" style={{ background: S.forest, color: S.lime }}>
                      {(label.slice(0, 1) || "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-[16px] font-[700]">{label}</span>
                  </li>
                );
              })}
            </ul>
            {!picked.length && (
              <p className="m-0 mt-3 text-[15px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("shareNewBirdDuo.justYou", "Only you for now.")}</p>
            )}
          </PopOutCard>
        }
      />
    );
  }

  return (
    <SetupFrame
      birdName={birdName}
      current="details"
      page={[2, 2]}
      title={title}
      intro={intro}
      onBack={onBack}
      footer={
        <div className="flex items-center gap-3">
          <SetupTextButton disabled={sharing} onClick={onContinue}>{t("shareNewBird.notNow", "Not now")}</SetupTextButton>
          <div className="min-w-0 flex-1">
            <SetupPrimaryButton disabled={sharing} onClick={onShare}>
              {sharing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {mainLabel}
            </SetupPrimaryButton>
          </div>
        </div>
      }
    >
      {list}
    </SetupFrame>
  );
}
