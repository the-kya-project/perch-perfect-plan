import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useBirdRole } from "@/lib/useBirdRole";
import { K, KyaPage, KyaBody } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { EmergencyInfo } from "@/components/EmergencyInfo";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";

// A bird's emergency info page (from the bird's record list).
export const Route = createFileRoute("/_authenticated/birds/$birdId/emergency")({
  head: () => ({ meta: [{ title: i18next.t("birdEmergency.metaTitle", "Emergency info — Kya & Co.") }] }),
  component: BirdEmergency,
});

function BirdEmergency() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const isOwner = useBirdRole(birdId) === "owner";
  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
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
  const { defaults, ownerName } = useBirdOwnerEmergency(birdId);
  const name = bird?.name ?? t("birdEmergency.yourBird", "your bird");
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/birds/$birdId", params: { birdId } }));
  const ready = contacts !== undefined && defaults !== undefined && !!bird;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={goBack} title={t("birdEmergency.title", "{{name}}'s emergency info", { name })} line={isOwner
          ? t("birdEmergency.line", "Same as your other birds, unless you change something here.")
          : t("birdEmergency.lineMember", "Same as {{owner}}'s other birds, unless it's changed here.", { owner: ownerName || t("birdEmergency.theOwner", "the owner") })} />
        <KyaBody className="gap-5">
          {ready ? (
            <EmergencyInfo
              key={contacts ? "c" : "n"}
              birdId={birdId}
              birdName={name}
              contacts={contacts ?? null}
              defaults={defaults ?? null}
              ownerName={ownerName}
              isOwner={isOwner}
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
