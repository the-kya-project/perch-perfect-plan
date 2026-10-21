import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useSitterContext } from "./route";
import { CarePlanView, type CareSection } from "@/components/CarePlanView";
import { K, KyaPage, KyaCard } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { firstName } from "@/lib/memberDisplay";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/sitter/$token/care-sheet")({
  component: CareSheet,
});

// The sitter's care sheet: the shared owner CarePlanView, read-only, with the
// sections the sitter has always seen — Food, Behavior, Your home (cleaning
// products included), Health (with the baseline clip), When to call, and the
// owner's clips. No routine (the sitter has it on Today), no contact list (the
// sitter has it on Emergency), no edit entry. data-coach targets cp-header and
// cp-food / cp-handling / cp-home / cp-health / cp-emergency (inside the view)
// feed the sitter walkthrough; keep them in sync with lib/sitterCareSections.
const SITTER_SECTIONS: readonly CareSection[] = ["food", "behavior", "home", "health", "emergency", "tips"];

function CareSheet() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: ctx } = useSitterContext(token);
  const bird = ctx.bird as any;
  const name = (bird?.name ?? "") as string;

  // The server falls back to "the owner" when it has no name; use the unnamed
  // wording then.
  const rawOwner = ((ctx as any).ownerName ?? "").toString().trim();
  const owner = rawOwner && rawOwner !== "the owner" ? firstName(rawOwner) : "";

  useEffect(() => { track("care_sheet_viewed", { surface: "sitter" }); }, []);

  const goBack = useGoBack(
    useCallback(() => navigate({ to: "/sitter/$token", params: { token }, search: { birdId: ctx.activeBirdId } }), [navigate, token, ctx.activeBirdId]),
  );

  const species = bird?.species ? speciesLabel(t, bird.species) : "";
  const age = birdAgeLabel(t, bird);
  const showIdentity = !!(name || species || age || bird?.photo_url);

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <div data-coach="cp-header">
          <PageHeader
            onBack={goBack}
            title={t("sitter.caresheet.titlePlan", "{{name}}'s care plan", { name })}
            line={owner
              ? t("sitter.caresheet.lineNamed", "Everything {{owner}} wants you to know.", { owner })
              : t("sitter.caresheet.subtitle", "Everything the owner wants you to know.")}
          />
        </div>
        <div className="px-4 pb-6">
          <CarePlanView
            data={{ bird: ctx.bird, plan: ctx.plan, watchClips: ctx.watchClips ?? [], baselineClipUrl: ctx.baselineClipUrl }}
            visibleSections={SITTER_SECTIONS}
            showEmergencyContacts={false}
            chipsOnForest
            separateNeverFeed
            ownerName={owner || undefined}
            tipsTitle={owner ? t("sitter.caresheet.tipsTitleNamed", "Tips from {{owner}}", { owner }) : t("sitter.caresheet.tipsTitle", "Tips from the owner")}
            tipsLine={owner ? t("sitter.caresheet.tipsLineNamed", "Short clips from {{owner}}, just for you.", { owner }) : t("sitter.caresheet.tipsLine", "Short clips from the owner, just for you.")}
            contextBanner={showIdentity ? (
              <KyaCard className="flex items-center gap-4 p-4">
                {bird?.photo_url ? (
                  <img src={bird.photo_url} alt={name} className="block size-16 shrink-0 rounded-[16px] object-cover" style={{ objectPosition: bird.photo_position ?? "50% 20%" }} />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-[16px] text-[22px] font-[700]" style={{ background: K.lime, color: K.forest }}>{(name || "?").slice(0, 1).toUpperCase()}</div>
                )}
                <div className="min-w-0" style={{ color: K.forest }}>
                  <p className="m-0 truncate text-[17px] font-[700]">{name}</p>
                  {species && <p className="m-0 mt-0.5 text-[14px]" style={{ color: K.quiet }}>{species}</p>}
                  {age && <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{age}</p>}
                </div>
              </KyaCard>
            ) : undefined}
            footer={
              <p className="m-0 px-1 text-center text-[13px]" style={{ color: K.quiet }}>
                <Trans
                  i18nKey="sitter.caresheet.reference"
                  defaults="Owner-provided reference. For general care guidance, see the <guide>Care guide</guide>."
                  components={{ guide: <Link to="/sitter/$token/guide" params={{ token }} className="font-[700] underline" style={{ color: K.moss }} /> }}
                />
              </p>
            }
          />
        </div>
      </div>
    </KyaPage>
  );
}
