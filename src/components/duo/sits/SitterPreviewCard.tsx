// The Sits empty state's right half on the iPhone Duo: what a sitter would
// get today, from the first bird's real care plan (today's routine, the daily
// health check, emergency contacts). Read-only, and no gold button (the left
// pane's "Set up a sit" is the screen's one main button).
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, Phone, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KyaLink } from "@/components/kya";
import { DUO, PopOutCard } from "@/components/duo/DuoBlocks";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { mergeEmergency } from "@/lib/emergency";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";

export function SitterPreviewCard({ bird }: { bird: { id: string; name: string } }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["sits-duo-preview-routine", bird.id],
    queryFn: async () => {
      const { data: plan } = await supabase.from("care_plans").select("id").eq("bird_id", bird.id).maybeSingle();
      if (!plan) return [];
      const { data } = await supabase.from("routine_tasks").select("id, title, derived").eq("care_plan_id", plan.id).order("category").order("sort_order");
      return (data ?? []) as { id: string; title: string; derived: unknown | null }[];
    },
  });
  // Same query (and key) as the bird's settings.
  const { data: contacts } = useQuery({
    queryKey: ["contacts", bird.id],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", bird.id).maybeSingle();
      return data;
    },
  });
  const { defaults } = useBirdOwnerEmergency(bird.id);
  const ec = contacts !== undefined && defaults !== undefined ? mergeEmergency(contacts, defaults) : null;
  const routineT = i18n.getFixedT(i18n.language, "routine");
  const label = (x: { title: string; derived: unknown | null }) => (x.derived ? renderDerivedTask(x.derived as DerivedTask, routineT, i18n.language).title : x.title);

  const missing = t("sitsDuo.notAddedYet", "Not added yet");
  const vet = [ec?.avian_vet_name, ec?.avian_vet_phone].filter(Boolean).join(" · ");

  return (
    <PopOutCard
      eyebrow={t("sitsDuo.sitterGets", "What a sitter gets")}
      title={t("sitsDuo.previewTitle", "{{name}}'s day, for a sitter", { name: bird.name })}
      footer={
        <KyaLink onClick={() => navigate({ to: "/birds/$birdId/plan", params: { birdId: bird.id } })}>
          {t("sitsDuo.openCarePlan", "Open {{name}}'s care plan", { name: bird.name })}
        </KyaLink>
      }
    >
      <p className="m-0 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>
        {t("sitsDuo.previewLine", "A sitter sees this on their phone, from a private link. No account needed.")}
      </p>

      <div className="mt-5 flex flex-col gap-6">
        <section>
          <h3 className="m-0 mb-2.5 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{t("sitsDuo.todaysRoutine", "Today's routine")}</h3>
          {isLoading ? null : tasks.length === 0 ? (
            <p className="m-0 text-[15px]" style={{ color: DUO.attentionText }}>{t("sitsDuo.noRoutineYet", "No daily tasks yet. Add them in the care plan.")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {tasks.map((x) => (
                <li key={x.id} className="flex min-h-[48px] items-center gap-3 rounded-[16px] px-3.5 py-2" style={{ background: DUO.bg }}>
                  <span aria-hidden="true" className="size-7 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: "#b9c7ba" }} />
                  <span className="min-w-0 flex-1 text-[15px] leading-[1.35]">{label(x)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="m-0 mb-2.5 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{t("sitsDuo.dailyCheck", "Daily health check")}</h3>
          <div className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: DUO.bg }}>
            <Activity className="size-5 shrink-0" aria-hidden="true" />
            <span className="text-[15px] leading-[1.4]">{t("sitsDuo.dailyCheckLine", "A quick check each day. You see the result, and anything that looks off is flagged.")}</span>
          </div>
        </section>

        <section>
          <h3 className="m-0 mb-2.5 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{t("account.emergencyInfo", "Emergency info")}</h3>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: DUO.bg }}>
              <Phone className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-[700]">{t("emergencyList.field.yourPhone", "Your phone")}</span>
                <span className="block text-[14px]" style={{ color: ec?.owner_phone ? DUO.quiet : DUO.attentionText }}>{ec ? ec.owner_phone || missing : ""}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: DUO.bg }}>
              <Stethoscope className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-[700]">{t("accountDuo.regularVet", "Regular vet")}</span>
                <span className="block text-[14px]" style={{ color: ec?.avian_vet_phone ? DUO.quiet : DUO.attentionText }}>{ec ? vet || missing : ""}</span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </PopOutCard>
  );
}
