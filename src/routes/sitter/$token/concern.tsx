import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSitterContext } from "./route";
import { pauseSitterReminders } from "@/lib/sitter.functions";
import { isOwnerPreview } from "@/lib/sitterPreviewMode";
import { ConcernFlow } from "@/components/ConcernFlow";
import { track } from "@/lib/analytics";
import type { VetContact } from "@/components/PassingGuidance";
import { pickVet } from "@/lib/emergency";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errorMessage";
import { K, KyaPage, KyaBody, KyaCard } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { VetCallRow, PersonCallRow } from "@/components/sitter/CallRows";

// "Something's wrong" — sitter-link entry into the shared ConcernFlow (pause →
// path choice → path detail). The flow + copy live in ConcernFlow, shared with
// the authenticated covering-member route, so both caregivers get the identical
// experience. The sitter never marks the bird as passed; only the owner does.
export const Route = createFileRoute("/sitter/$token/concern")({
  component: ConcernPage,
});

function ConcernPage() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const { data: ctx } = useSitterContext(token);
  const qc = useQueryClient();
  const pauseFn = useServerFn(pauseSitterReminders);
  const navigate = useNavigate();
  const goBack = useGoBack(useCallback(() => navigate({ to: "/sitter/$token", params: { token } }), [navigate, token]));

  const name = ctx.bird.name as string;
  const owner = ((ctx as any).ownerName ?? "the owner") as string;
  const ownerPhone = ((ctx.contacts as any)?.owner_phone ?? null) as string | null;
  // One vet record, picked first, so the name and number always match.
  const picked = pickVet(ctx.contacts as any);
  const vet: VetContact = { name: picked?.name ?? null, phone: picked?.phone ?? null };

  const m = useMutation({
    mutationFn: () => pauseFn({ data: { token, birdId: ctx.activeBirdId as string, preview: isOwnerPreview() } }),
    onSuccess: () => {
      track("concern_flow_started", { actor: "sitter" });
      qc.invalidateQueries({ queryKey: ["sitter-ctx", token] });
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
      window.scrollTo(0, 0);
    },
    onError: (e: any) => toast.error(friendlyError(e, t("sitter.concern.pauseError", "Couldn't pause the reminders. Please try again."), t)),
  });

  const sexInitial = typeof (ctx.bird as any).sex === "string" ? ((ctx.bird as any).sex as string).trim().charAt(0).toLowerCase() : "";
  const line = sexInitial === "m"
    ? t("sitter.concern.line_m", "If he's sick, hurt, or has passed, here's what to do.")
    : sexInitial === "f"
    ? t("sitter.concern.line_f", "If she's sick, hurt, or has passed, here's what to do.")
    : t("sitter.concern.line_n", "If they're sick, hurt, or have passed, here's what to do.");
  const vetIsAvian = picked?.kind !== "emergency";

  return (
    <KyaPage>
      <PageHeader
        title={t("sitter.concern.title", "Something's wrong with {{name}}", { name })}
        line={line}
        onBack={goBack}
      />
      <KyaBody className="pb-32">
        {/* Calls first: the avian vet (red, same as Emergency), then the owner. */}
        <div className="flex flex-col gap-2.5">
          <VetCallRow
            surface="mist"
            label={vetIsAvian ? t("sitter.calls.avianVet", "Avian vet") : t("sitter.calls.emergencyVet", "After-hours emergency vet")}
            name={vet.name}
            phone={vet.phone}
          />
          <PersonCallRow
            surface="mist"
            label={t("sitter.calls.owner", "Owner")}
            name={owner !== "the owner" ? owner : null}
            phone={ownerPhone}
          />
        </div>

        {/* Moved here from Today: the line that used to sit under the
            "Something's wrong" link. */}
        <p className="m-0 mt-2 px-1 text-[13.5px] font-[700]" style={{ color: K.quiet }}>
          {t("sitter.today.somethingWrongHint", "If {{name}} has passed or is in serious trouble", { name })}
        </p>
        <KyaCard className="p-5">
          <ConcernFlow
            name={name}
            ownerName={owner}
            ownerPhone={ownerPhone}
            vet={vet}
            paused={!!(ctx as any).remindersPaused || m.isSuccess}
            onPause={() => m.mutate()}
            pausePending={m.isPending}
            look="kya"
            ownerCallShown
          />
        </KyaCard>
      </KyaBody>
    </KyaPage>
  );
}
