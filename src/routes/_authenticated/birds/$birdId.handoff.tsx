import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { createHandoff } from "@/lib/handoff.functions";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { ArrowRightLeft, AlertTriangle } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaField, KyaPrimaryButton, KyaLink } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { friendlyError } from "@/lib/errorMessage";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/birds/$birdId/handoff")({
  head: () => ({ meta: [{ title: i18next.t("birdHandoff.metaTitle", "Hand off — Kya & Co.") }] }),
  component: HandoffFlow,
});

function HandoffFlow() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));

  const { data: bird } = useQuery({
    queryKey: ["handoff-bird", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds").select("id, name, owner_id").eq("id", birdId).maybeSingle();
      return { row: data as { id: string; name: string; owner_id: string } | null, uid: u.user?.id ?? null };
    },
  });
  const name = bird?.row?.name ?? t("birdHandoff.thisBird", "this bird");
  // Not the owner → this screen isn't for them. Redirect from an effect, not
  // during render (navigating while rendering is a React warning and can loop);
  // render nothing meanwhile.
  const notOwner = !!(bird?.row && bird.uid && bird.row.owner_id !== bird.uid);
  useEffect(() => {
    if (notOwner) navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
  }, [notOwner, navigate, birdId]);

  const create = useServerFn(createHandoff);
  const m = useMutation({
    mutationFn: () => create({ data: { birdId, recipientEmail: email.trim(), recipientName: recipientName.trim() || undefined } }),
    onSuccess: () => {
      toast.success(t("birdHandoff.sent", "Handoff sent."));
      track("bird_handoff_initiated", { has_recipient_name: !!recipientName.trim() });
      qc.invalidateQueries({ queryKey: ["pending-handoff", birdId] });
      navigate({ to: "/birds/$birdId", params: { birdId } });
    },
    onError: (e: any) => toast.error(friendlyError(e, t("birdHandoff.sendFailed", "Couldn't send the handoff."))),
  });

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());

  if (notOwner) return null;

  return (
    <KyaPage>
      <PageHeader
        title={t("birdHandoff.title", "Hand off {{name}}", { name })}
        line={t("birdHandoff.intro", "Pass {{name}}'s record to the adopter so they have everything you've learned. The record goes with the bird; once accepted, you won't have access anymore.", { name })}
        onBack={goBack}
      />

      <KyaBody>
        <KyaCard className="flex flex-col gap-4 p-4">
          <KyaField
            id="handoff-email"
            label={t("birdHandoff.emailLabel", "Adopter's email")}
            type="email" inputMode="email" autoCapitalize="off" autoCorrect="off"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("birdHandoff.emailPlaceholder", "adopter@example.com")}
          />
          <KyaField
            id="handoff-name"
            label={t("birdHandoff.nameLabel", "Adopter's name (optional)")}
            value={recipientName} maxLength={120} onChange={(e) => setRecipientName(e.target.value)}
            placeholder={t("birdHandoff.namePlaceholder", "e.g. Sam")}
          />
        </KyaCard>

        <KyaCard className="p-4">
          <KyaHeading>{t("birdHandoff.goesWith", "What goes with {{name}}", { name })}</KyaHeading>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.5]" style={{ color: K.ink }}>
            <li>{t("birdHandoff.goesItem1", "Care plan, identity, weight history, journal, moments")}</li>
            <li>{t("birdHandoff.goesItem2", "The photos in those records")}</li>
          </ul>
        </KyaCard>
        <KyaCard className="p-4">
          <KyaHeading>{t("birdHandoff.staysWithYou", "What stays with you")}</KyaHeading>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.5]" style={{ color: K.ink }}>
            <li>{t("birdHandoff.staysItem1", "Your contact info — it doesn't transfer")}</li>
            <li>{t("birdHandoff.staysItem2", "A memory entry in Past birds (name, dates, where they went)")}</li>
          </ul>
        </KyaCard>

        <div className="rounded-[20px] p-4" style={{ background: "#fcebeb", border: `1.5px solid ${K.red}` }}>
          <p className="m-0 flex items-start gap-2 text-[14px] leading-[1.5]" style={{ color: "#791f1f" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: K.red }} aria-hidden="true" />
            <span><span className="font-[700]">{t("birdHandoff.cantUndo", "This can't be undone.")}</span> {t("birdHandoff.cantUndoBody", "Once they accept, the record is theirs. You won't be able to view or edit it.")}</span>
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 pt-1">
          <KyaPrimaryButton disabled={!emailOk || m.isPending} onClick={() => m.mutate()} icon={<ArrowRightLeft className="size-4" />}>
            {m.isPending ? t("birdHandoff.sending", "Sending…") : t("birdHandoff.send", "Send handoff")}
          </KyaPrimaryButton>
          <KyaLink className="text-center" onClick={() => navigate({ to: "/birds/$birdId/export", params: { birdId } })}>
            {t("birdHandoff.exportInstead", "They're not on the app — export as PDF instead")}
          </KyaLink>
        </div>
      </KyaBody>
    </KyaPage>
  );
}
