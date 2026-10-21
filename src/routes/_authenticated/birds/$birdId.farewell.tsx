import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { markBirdPassed } from "@/lib/passed.functions";
import { mergeEmergency, pickVet } from "@/lib/emergency";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { PathDetail, type PassingPath, type VetContact } from "@/components/PassingGuidance";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { useTranslation } from "react-i18next";

// Owner mark-as-passed flow. Two states, one visit:
//   ask      → the gentle confirmation screen
//   guidance → shown ONCE, immediately after confirming (never ambient; a later
//              visit to this URL redirects to Remembering instead)
// Marking preserves everything — the record becomes a memorial; nothing deletes.
export const Route = createFileRoute("/_authenticated/birds/$birdId/farewell")({
  head: () => ({ meta: [{ title: "Kya & Co." }] }),
  component: Farewell,
});

function Farewell() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isOwner = useBirdRole(birdId) === "owner";
  const [step, setStep] = useState<"ask" | "guidance">("ask");
  const [busy, setBusy] = useState(false);
  const mark = useServerFn(markBirdPassed);
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));

  const { data } = useQuery({
    queryKey: ["farewell", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const [bird, contacts, defaults, profile] = await Promise.all([
        supabase.from("birds").select("id, name, passed_at, owner_id").eq("id", birdId).maybeSingle(),
        supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle(),
        u.user ? supabase.from("owner_emergency_defaults").select("*").eq("owner_id", u.user.id).maybeSingle() : Promise.resolve({ data: null } as any),
        u.user ? supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      const merged = mergeEmergency(contacts.data as any, defaults.data as any) as any;
      // One vet record, picked first, so the name and number always match.
      const picked = pickVet(merged);
      const vet: VetContact = { name: picked?.name ?? null, phone: picked?.phone ?? null };
      return {
        bird: bird.data as any,
        vet,
        ownerName: ((profile.data?.display_name ?? "").toString().trim() || t("farewell.you", "you")) as string,
      };
    },
  });

  const bird = data?.bird;
  const name = bird?.name ?? t("farewell.yourBird", "your bird");

  // Never ambient: if the bird is already passed and we're not mid-flow (i.e.
  // someone revisits this URL later), the memorial is the destination. And a
  // non-owner is bounced back to the bird page. Both redirect from an effect,
  // not during render (navigating while rendering is a React warning and can
  // loop); render nothing meanwhile.
  const toMemorial = !!bird?.passed_at && step === "ask";
  const notOwner = !!bird && !isOwner;
  useEffect(() => {
    if (toMemorial) navigate({ to: "/remembering", replace: true });
    else if (notOwner) navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
  }, [toMemorial, notOwner, navigate, birdId]);
  if (toMemorial || notOwner) return null;

  async function confirm() {
    setBusy(true);
    try {
      await mark({ data: { birdId } });
      // The bird leaves the active flock everywhere; the record stays.
      qc.invalidateQueries({ queryKey: ["birds"] });
      qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
      qc.invalidateQueries({ queryKey: ["remembering-birds"] });
      qc.invalidateQueries({ queryKey: ["remembering-count"] });
      setStep("guidance");
      window.scrollTo(0, 0);
    } catch (e: any) {
      toast.error(friendlyError(e, t("farewell.error", "Something went wrong. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  if (step === "guidance") {
    return (
      <KyaPage>
        <PageHeader
          title={t("farewell.guidanceTitle", "A few things that can help")}
          line={t("farewell.guidanceEyebrow", "In your own time")}
          onBack={goBack}
        />
        <KyaBody>
          <KyaCard className="p-5">
            <KyaHeading>{t("farewell.necropsyTitle", "Should you consider a necropsy?")}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.55]" style={{ color: K.ink }}>
              {t("farewell.necropsyBody", "If {{name}}'s passing was sudden or unexplained, or you have other birds, a necropsy can tell you why, and whether your flock is at risk. It's time sensitive, so it helps to decide soon.", { name })}
            </p>
          </KyaCard>

          {/* The same three body-care paths the sitter sees, for an owner who
              is with their bird. Collapsed by choice — nothing is forced. */}
          <GuidancePaths name={name} ownerName={data?.ownerName ?? t("farewell.you", "you")} vet={data?.vet ?? { name: null, phone: null }} />

          <p className="m-0 px-1 text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>
            {t("farewell.disclaimer", "Gentle starting points, not medical advice. Your avian vet can guide the specifics.")}
          </p>

          <KyaSecondaryButton className="w-full" onClick={() => navigate({ to: "/dashboard" })}>{t("farewell.done", "Done")}</KyaSecondaryButton>
        </KyaBody>
      </KyaPage>
    );
  }

  return (
    <KyaPage>
      <PageHeader
        title={t("farewell.askHeadline", "Has {{name}} passed away?", { name })}
        line={t("farewell.askEyebrow", "Take your time")}
        onBack={goBack}
      />
      <KyaBody>
        <KyaCard className="p-5">
          <p className="m-0 text-[15px] leading-[1.55]" style={{ color: K.ink }}>
            {t("farewell.askBody", "We're so sorry. This gently pauses {{name}}'s daily reminders, and if a sit is active, lets their sitter know they can stop too. {{name}}'s record, journal, and moments are kept, so you can look back whenever you'd like.", { name })}
          </p>
        </KyaCard>
        <div className="flex flex-col gap-2.5">
          <KyaPrimaryButton disabled={busy || !bird} onClick={confirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : t("farewell.confirm", "Yes, {{name}} has passed", { name })}
          </KyaPrimaryButton>
          <KyaSecondaryButton className="w-full" onClick={() => navigate({ to: "/birds/$birdId", params: { birdId } })}>
            {t("farewell.notNow", "Not now")}
          </KyaSecondaryButton>
        </div>
      </KyaBody>
    </KyaPage>
  );
}

// Three collapsible path details (owner audience). Content lives in
// PassingGuidance and is shared verbatim with the sitter's path screens.
function GuidancePaths({ name, ownerName, vet }: { name: string; ownerName: string; vet: VetContact }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<PassingPath | null>(null);
  // Same keys/wording as PassingGuidance's path choice (shared with the sitter).
  const paths: { key: PassingPath; label: string }[] = [
    { key: "necropsy", label: t("passingGuidance.pathChoice.necropsy", "Keep {{name}} for a necropsy", { name }) },
    { key: "burial", label: t("passingGuidance.pathChoice.burial", "Prepare {{name}} for burial or cremation", { name }) },
    { key: "vet", label: t("passingGuidance.pathChoice.vet", "Bring {{name}} to the vet", { name }) },
  ];
  return (
    <KyaCard>
      {paths.map((p, i) => {
        const isOpen = open === p.key;
        const last = i === paths.length - 1;
        return (
          <div key={p.key} style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p.key)}
              aria-expanded={isOpen}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
              style={{ color: K.forest }}
            >
              <span className="flex-1 text-[15px] font-[700]">{p.label}</span>
              <ChevronDown className={`size-[18px] shrink-0 transition ${isOpen ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1">
                <PathDetail path={p.key} name={name} ownerName={ownerName} vet={vet} audience="owner" look="kya" />
              </div>
            )}
          </div>
        );
      })}
    </KyaCard>
  );
}
