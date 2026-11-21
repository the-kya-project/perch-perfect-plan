import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { K, KyaPage, KyaBody } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { useCallback } from "react";
import { EmergencyInfo } from "@/components/EmergencyInfo";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { LoadError } from "@/components/LoadError";
import { useTooLong } from "@/lib/useTooLong";
import { useDuoMode } from "@/lib/duo";
import { BirdSettingsDuo } from "@/components/duo/BirdSettingsDuo";

// A bird's emergency info page (from the bird's record list).
export const Route = createFileRoute("/_authenticated/birds/$birdId/emergency")({
  head: () => ({ meta: [{ title: i18next.t("birdEmergency.metaTitle", "Emergency info — Kya & Co.") }] }),
  component: BirdEmergencyRoute,
});


// iPhone Duo, two panes: this page in the card beside the bird's settings
// tiles (BirdSettingsDuo).
function BirdEmergencyRoute() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));
  if (useDuoMode() === "sideways") return <BirdSettingsDuo birdId={birdId} selected="emergency" onBack={goBack}><BirdEmergency /></BirdSettingsDuo>;
  return <BirdEmergency />;
}

function BirdEmergency() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const isOwner = useBirdRole(birdId) === "owner";
  // Owners always; household members with "Manage emergency info".
  const canEdit = useCapability("manage_emergency", { birdId });
  // Throws on a failed request so that a dropped connection isn't mistaken for
  // a bird that's gone (null = no such bird, or no longer shared with you).
  const { data: bird, isSuccess: birdKnown, isError: birdError } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  // Always the bird OWNER's account info, even for a household member.
  const { defaults, ownerName, failed: ownerFailed } = useBirdOwnerEmergency(birdId);
  const name = bird?.name ?? t("birdEmergency.yourBird", "your bird");
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/birds/$birdId", params: { birdId } }));
  const ready = contacts !== undefined && defaults !== undefined && !!bird;
  // Never "Loading…" forever: a missing bird says so, a failed load (or one
  // still waiting after 10 s) offers a retry.
  const birdMissing = birdKnown && !bird;
  const { tooLong, restart } = useTooLong(!ready && !birdMissing && !birdError && !ownerFailed);
  const retry = () => { restart(); void qc.refetchQueries({ type: "active" }); };

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        {/* The "same as your other birds" line is for the owner only;
            household members get no line. */}
        <PageHeader onBack={goBack} title={t("birdEmergency.title", "{{name}}'s emergency info", { name })} line={isOwner
          ? t("birdEmergency.line", "Same as your other birds, unless you change something here.")
          : undefined} />
        <KyaBody className="gap-5">
          {birdMissing || birdError || ownerFailed || tooLong ? (
            <LoadError
              missing={birdMissing}
              onRetry={retry}
              onBack={birdMissing ? () => navigate({ to: "/dashboard" }) : undefined}
              backLabel={birdMissing ? t("loadError.backHome", "Back to home") : undefined}
            />
          ) : ready ? (
            <EmergencyInfo
              key={contacts ? "c" : "n"}
              birdId={birdId}
              birdName={name}
              contacts={contacts ?? null}
              defaults={defaults ?? null}
              ownerName={ownerName}
              isOwner={isOwner}
              vetGapCard
              canEdit={canEdit}
              onSaved={() => qc.invalidateQueries({ queryKey: ["contacts", birdId] })}
            />
          ) : (
            <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("birdEmergency.loading", "Loading…")}</p>
          )}
        </KyaBody>
      </div>
    </KyaPage>
  );
}
