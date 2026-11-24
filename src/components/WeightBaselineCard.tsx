// The weight baseline on the weight page (backlog D1.2), behind the
// `weight_baseline` health switch (off; admins only while in shadow mode). With
// the switch off this renders nothing and asks for nothing but the switch.
//
// Shows, from computeWeightBaseline (src/lib/weightBaseline.ts):
//   - one alert card at most, most serious first (baselineCard);
//   - a small celebration the first time the bird's usual weight is learned
//     (remembered on this device, read after mount so the first render matches
//     the server's);
//   - the usual range for the latest weigh-in's kind, or "still learning";
//   - for the owner, the optional ideal weight range field: the only place the
//     range ever appears. No goal or progress wording anywhere.
//
// Every number and line is draft, pending vet review (src/lib/healthRules.ts).
// Weight alerts are observational: they never tell the owner to go to or call
// the vet.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { PartyPopper, Scale, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errorMessage";
import { useHealthFeature } from "@/lib/useHealthFeature";
import {
  baselineCard,
  computeWeightBaseline,
  DEFAULT_BASELINE_RULES,
  type BaselineCard,
  type IdealRange,
  type MealState,
  type WeighIn,
  type WeightBaselineResult,
} from "@/lib/weightBaseline";
import { K, SERIF, KyaCard, KyaField, KyaLink, KyaPrimaryButton } from "@/components/kya";

const MIN_G = 1;
const MAX_G = 5000;
const SEEN_KEY = (birdId: string) => `kya.weightBaseline.learnedSeen.${birdId}`;

/** "About X%": whole percent, never below 1. */
const pctText = (n: number | null | undefined) => String(Math.max(1, Math.round(Math.abs(n ?? 0))));

function useIdealWeight(birdId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bird-ideal-weight", birdId],
    enabled,
    queryFn: async (): Promise<IdealRange> => {
      // Postdates the generated types.
      const { data, error } = await (supabase as any)
        .from("bird_ideal_weights")
        .select("low_grams, high_grams")
        .eq("bird_id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data ? { low: Number(data.low_grams), high: Number(data.high_grams) } : null;
    },
  });
}

export function WeightBaselinePanel({
  birdId,
  name,
  entries,
  isOwner,
}: {
  birdId: string;
  name: string;
  entries: readonly WeighIn[] | undefined;
  isOwner: boolean;
}) {
  const enabled = useHealthFeature("weight_baseline") === true;
  const idealQ = useIdealWeight(birdId, enabled);
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY(birdId)) === "1");
    } catch {
      setSeen(true);
    }
  }, [birdId]);

  if (!enabled || !entries || idealQ.isPending) return null;
  const ideal = idealQ.data ?? null;
  const result = computeWeightBaseline(entries, DEFAULT_BASELINE_RULES, ideal);
  const card = baselineCard(result);
  const anyLearned = Object.values(result.baselines).some((b) => b.status === "learned");

  function markSeen() {
    try {
      window.localStorage.setItem(SEEN_KEY(birdId), "1");
    } catch {
      /* private mode: it shows again next time, which is harmless */
    }
    setSeen(true);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="weight-baseline">
      {card && <AlertCard card={card} name={name} result={result} />}
      {anyLearned && seen === false && <LearnedCelebration name={name} onDone={markSeen} />}
      <UsualRange name={name} result={result} />
      {isOwner && <IdealWeightField birdId={birdId} ideal={ideal} />}
    </div>
  );
}

function alertText(t: TFunction, card: BaselineCard, name: string, r: WeightBaselineResult) {
  switch (card) {
    case "sudden_confirmed":
      return {
        strong: true,
        title: t("weightBaseline.suddenConfirmedTitle", "Weight dropped quickly"),
        body: t(
          "weightBaseline.suddenConfirmedBody",
          "A second weigh-in shows the same change: {{name}} is about {{pct}}% lighter than a few days ago. This is a big change in a short time. Remember, birds are excellent at hiding illness. Take note of how {{name}} is eating and acting today.",
          { name, pct: pctText(r.sudden.dropPct) },
        ),
      };
    case "shifted":
      return {
        strong: true,
        title: t("weightBaseline.shiftedTitle", "Weight has shifted"),
        body: t(
          "weightBaseline.shiftedBody",
          "We've noticed {{name}}'s weight has shifted. {{name}} is about {{pct}}% below usual. Have you noticed any changes in eating or energy? It can help to notice whether {{name}} is eating less, quieter than usual, or fluffed up.",
          { name, pct: pctText(r.dropPct) },
        ),
      };
    case "hard_loss":
      return {
        strong: true,
        title: t("weightBaseline.shiftedTitle", "Weight has shifted"),
        body: t(
          "weightBaseline.hardLossBody",
          "We've noticed {{name}}'s weight has shifted. {{name}} is about {{pct}}% below the last few weeks. Have you noticed any changes in eating or energy? It can help to notice whether {{name}} is eating less, quieter than usual, or fluffed up.",
          { name, pct: pctText(r.hardDropPct) },
        ),
      };
    case "sudden_reweigh":
      return {
        strong: false,
        title: t("weightBaseline.reweighTitle", "Weigh again"),
        body: t(
          "weightBaseline.suddenReweighBody",
          "{{name}}'s weight is about {{pct}}% lower than the last few days. Weigh {{name}} again to check the reading.",
          { name, pct: pctText(r.sudden.dropPct) },
        ),
      };
    case "reweigh":
      return {
        strong: false,
        title: t("weightBaseline.reweighTitle", "Weigh again"),
        body: t(
          "weightBaseline.reweighBody",
          "This weigh-in is lower than usual for {{name}}. Weigh {{name}} again to check the reading.",
          { name },
        ),
      };
    case "keep_an_eye":
      return {
        strong: false,
        title: t("weightBaseline.keepAnEyeTitle", "Keep an eye on this"),
        body: t(
          "weightBaseline.keepAnEyeBody",
          "{{name}} has been about {{pct}}% below usual for a while. Take note of how {{name}} is eating and acting over the next few days.",
          { name, pct: pctText(r.dropPct) },
        ),
      };
    case "worth_watching":
      return {
        strong: false,
        title: t("weightBaseline.worthWatchingTitle", "Worth watching"),
        body: t(
          "weightBaseline.worthWatchingBody",
          "{{name}} is about {{pct}}% below usual. Keep weighing as you normally do.",
          { name, pct: pctText(r.dropPct) },
        ),
      };
  }
}

function AlertCard({
  card,
  name,
  result,
}: {
  card: BaselineCard;
  name: string;
  result: WeightBaselineResult;
}) {
  const { t } = useTranslation();
  const a = alertText(t, card, name, result);
  return (
    <section
      role="status"
      data-card={card}
      className="flex gap-3 rounded-[20px] p-4"
      style={{ background: K.amberBg, color: K.forest }}
    >
      {card === "reweigh" || card === "sudden_reweigh" ? (
        <Scale
          className="mt-0.5 size-5 shrink-0"
          style={{ color: K.amberText }}
          aria-hidden="true"
        />
      ) : (
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0"
          style={{ color: a.strong ? K.red : K.amberText }}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <h3
          className="m-0 text-[17px] font-[700] leading-[1.25]"
          style={{ fontFamily: SERIF, color: a.strong ? K.red : K.amberText }}
        >
          {a.title}
        </h3>
        <p className="m-0 mt-1 text-[14px] leading-[1.45]">{a.body}</p>
      </div>
    </section>
  );
}

function LearnedCelebration({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      className="flex gap-3 rounded-[20px] p-4"
      style={{ background: K.lime, color: K.forest }}
      data-testid="weight-baseline-learned"
    >
      <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[17px] font-[700] leading-[1.25]" style={{ fontFamily: SERIF }}>
          {t("weightBaseline.learnedTitle", "We've learned {{name}}'s usual weight", { name })}
        </h3>
        <p className="m-0 mt-1 text-[14px] leading-[1.45]">
          {t(
            "weightBaseline.learnedBody",
            "Thanks for weighing {{name}} so regularly. From now on, each weigh-in is compared with what's usual for {{name}}.",
            { name },
          )}
        </p>
        <KyaLink color={K.forest} onClick={onDone}>
          {t("weightBaseline.gotIt", "Got it")}
        </KyaLink>
      </div>
    </section>
  );
}

function usualLine(t: TFunction, kind: MealState, name: string, low: number, high: number) {
  const opts = { name, low: low.toLocaleString(), high: high.toLocaleString() };
  if (kind === "before_meal")
    return t(
      "weightBaseline.usualBefore",
      "Before a meal, {{name}} usually weighs {{low}}–{{high}} g.",
      opts,
    );
  if (kind === "after_meal")
    return t(
      "weightBaseline.usualAfter",
      "After a meal, {{name}} usually weighs {{low}}–{{high}} g.",
      opts,
    );
  return t("weightBaseline.usual", "{{name}} usually weighs {{low}}–{{high}} g.", opts);
}

function learningLine(
  t: TFunction,
  kind: MealState,
  name: string,
  done: number,
  need: number,
  days: number,
) {
  const opts = { name, done, need, days };
  if (kind === "before_meal")
    return t(
      "weightBaseline.learningBefore",
      "We're still learning {{name}}'s usual weight before a meal: {{done}} of {{need}} weigh-ins so far, over at least {{days}} days.",
      opts,
    );
  if (kind === "after_meal")
    return t(
      "weightBaseline.learningAfter",
      "We're still learning {{name}}'s usual weight after a meal: {{done}} of {{need}} weigh-ins so far, over at least {{days}} days.",
      opts,
    );
  return t(
    "weightBaseline.learning",
    "We're still learning {{name}}'s usual weight: {{done}} of {{need}} weigh-ins so far, over at least {{days}} days.",
    opts,
  );
}

function UsualRange({ name, result }: { name: string; result: WeightBaselineResult }) {
  const { t } = useTranslation();
  const kind: MealState = result.latest?.mealState ?? "unlabeled";
  const b = result.baselines[kind];
  return (
    <KyaCard className="px-4 py-3.5">
      <p className="m-0 text-[12.5px] font-[700]" style={{ color: K.quiet }}>
        {b.status === "learned"
          ? t("weightBaseline.usualTitle", "Usual weight")
          : t("weightBaseline.learningTitle", "Still learning")}
      </p>
      <p className="m-0 mt-1 text-[15px] leading-[1.4]" style={{ color: K.forest }}>
        {b.status === "learned"
          ? usualLine(t, kind, name, b.low, b.high)
          : learningLine(
              t,
              kind,
              name,
              Math.min(b.count, b.needWeighIns),
              b.needWeighIns,
              b.needDays,
            )}
      </p>
    </KyaCard>
  );
}

/** The owner's ideal weight range: its own field, and the only place it's ever shown. */
function IdealWeightField({ birdId, ideal }: { birdId: string; ideal: IdealRange }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState(ideal ? String(ideal.low) : "");
  const [high, setHigh] = useState(ideal ? String(ideal.high) : "");
  const [saving, setSaving] = useState(false);
  const lo = Number(low);
  const hi = Number(high);
  const valid = low !== "" && high !== "" && lo >= MIN_G && hi <= MAX_G && lo <= hi;
  const showInvalid = low !== "" && high !== "" && !valid;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("bird_ideal_weights")
        .upsert(
          { bird_id: birdId, low_grams: lo, high_grams: hi, updated_at: new Date().toISOString() },
          { onConflict: "bird_id" },
        );
      if (error) throw error;
      toast.success(t("weightBaseline.idealSaved", "Saved."));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bird-ideal-weight", birdId] });
    } catch (e: any) {
      toast.error(
        friendlyError(e, t("weightBaseline.idealSaveFailed", "Couldn't save the range.")),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("bird_ideal_weights")
        .delete()
        .eq("bird_id", birdId);
      if (error) throw error;
      toast.success(t("weightBaseline.idealRemoved", "Removed."));
      setLow("");
      setHigh("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bird-ideal-weight", birdId] });
    } catch (e: any) {
      toast.error(
        friendlyError(e, t("weightBaseline.idealSaveFailed", "Couldn't save the range.")),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3 text-left text-[14px]"
        style={{ color: K.forest }}
      >
        <span className="font-[700]">
          {t("weightBaseline.idealTitle", "Ideal weight range (optional)")}
        </span>
        <span style={{ color: K.quiet }}>
          {ideal
            ? t("weightBaseline.idealValue", "{{low}}–{{high}} g", {
                low: ideal.low.toLocaleString(),
                high: ideal.high.toLocaleString(),
              })
            : t("weightBaseline.idealAdd", "Add")}
        </span>
      </button>
    );
  }

  return (
    <KyaCard className="flex flex-col gap-3 p-4">
      <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>
        {t("weightBaseline.idealTitle", "Ideal weight range (optional)")}
      </p>
      <p className="m-0 -mt-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>
        {t(
          "weightBaseline.idealHint",
          "Private to you. It isn't shown to sitters or anywhere else.",
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <KyaField
          id="ideal-low"
          label={t("weightBaseline.idealLow", "From (g)")}
          inputMode="decimal"
          value={low}
          onChange={(e) => setLow(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <KyaField
          id="ideal-high"
          label={t("weightBaseline.idealHigh", "To (g)")}
          inputMode="decimal"
          value={high}
          onChange={(e) => setHigh(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>
      {showInvalid && (
        <span className="block px-1 text-[13px]" style={{ color: K.amberText }}>
          {t(
            "weightBaseline.idealInvalid",
            "Enter two weights between {{min}} and {{max}} grams, the lower one first.",
            { min: MIN_G, max: MAX_G },
          )}
        </span>
      )}
      <div className="flex flex-col items-center gap-1">
        <KyaPrimaryButton onClick={save} disabled={!valid || saving}>
          {saving
            ? t("weightBaseline.idealSaving", "Saving…")
            : t("weightBaseline.idealSave", "Save")}
        </KyaPrimaryButton>
        {ideal && (
          <KyaLink color={K.red} onClick={remove}>
            {t("weightBaseline.idealRemove", "Remove")}
          </KyaLink>
        )}
        <KyaLink color={K.quiet} onClick={() => setOpen(false)}>
          {t("weightBaseline.idealCancel", "Cancel")}
        </KyaLink>
      </div>
    </KyaCard>
  );
}
