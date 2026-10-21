import { namesAsCount } from "@/lib/birdNames";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Calendar, Link2, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { SitChecklist } from "@/components/SitChecklist";
import { formatDateRangeUS } from "@/lib/dates";
import { fetchDisplayNames } from "@/lib/resolveNames";
import { useTranslation, Trans } from "react-i18next";
import { useConfirm } from "@/components/ConfirmSheet";
import { mergeEmergency } from "@/lib/emergency";

type Bird = { id: string; name: string };

export function SitCard({ sit, birds = [], allBirds, onChange }: { sit: any; birds?: Bird[]; allBirds?: any[]; onChange: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm, sheet: confirmSheet } = useConfirm();
  // Two caregiver kinds — see migration sits_one_caregiver_chk. A household sit
  // has no token (and never expires by a token window); it just runs from
  // start_date through end_date.
  const isHousehold = !!sit.caregiver_user_id;
  const expired = !isHousehold && sit.token_expires_at && new Date(sit.token_expires_at) < new Date();
  const ended = new Date(sit.end_date + "T23:59:59") < new Date();
  const upcoming = new Date(sit.start_date) > new Date(new Date().toDateString());
  const status = sit.revoked
    ? t("sitCard.revoked", "Revoked")
    : expired || ended
      ? (isHousehold && ended ? t("sitCard.ended", "Ended") : t("sitCard.expired", "Expired"))
      : upcoming ? t("sitCard.upcoming", "Upcoming") : t("sitCard.active", "Active");
  const tone = sit.revoked || expired || ended ? "bg-[#f1f5f0] text-[#5f5e5a]" : upcoming ? "bg-[#f6e7c4] text-[#854f0b]" : "bg-[#d6e8dc] text-[#1a5e3f]";
  const url = !isHousehold && typeof window !== "undefined" ? `${window.location.origin}/sitter/${sit.invite_token}` : "";

  // Resolve the household caregiver's display name for the card — server-side,
  // since profiles RLS is self-only (a direct read of their row comes back empty).
  const { data: rawCaregiverName } = useQuery({
    queryKey: ["sit-caregiver-name", sit.caregiver_user_id],
    enabled: isHousehold,
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetchDisplayNames([sit.caregiver_user_id], { rethrow: true }))[sit.caregiver_user_id] ?? "",
  });

  // Empty display name → "Household member" (translated at display, not cached).
  const caregiverName = rawCaregiverName === undefined ? undefined : rawCaregiverName || t("sitCard.householdMember", "Household member");

  async function revoke() {
    const yes = await confirm({
      title: t("sitCard.confirmRevokeTitle", "Revoke this invite link?"),
      body: t("sitCard.confirmRevokeBody", "The sitter will lose access to the care plan right away."),
      confirmLabel: t("sitCard.revokeLinkAction", "Revoke link"),
      cancelLabel: t("sitCard.keepLink", "Keep link"),
    });
    if (!yes) return;
    await supabase.from("sits").update({ revoked: true }).eq("id", sit.id);
    toast.success(t("sitCard.linkRevoked", "Link revoked."));
    onChange();
  }
  async function remove() {
    const yes = await confirm({
      title: t("sitCard.confirmDeleteTitle", "Delete this sit?"),
      body: t("sitCard.confirmDeleteBodyKeepsLogs", "Its checklist is removed. Daily checks, weights, and photos logged during it are kept. This can't be undone."),
      confirmLabel: t("sitCard.delete", "Delete"),
      cancelLabel: t("sitCard.keep", "Keep"),
    });
    if (!yes) return;
    await supabase.from("sits").delete().eq("id", sit.id);
    toast.success(t("sitCard.deleted", "Sit deleted."));
    onChange();
  }
  async function copy() {
    const birdIds = birds.map((b) => b.id);
    if (birdIds.length) {
      const [{ data: contacts }, { data: u }] = await Promise.all([
        supabase
          .from("emergency_contacts")
          .select("bird_id, owner_phone, avian_vet_name, avian_vet_phone, avian_vet_address")
          .in("bird_id", birdIds),
        getLocalUser(),
      ]);
      const { data: defaults } = u.user
        ? await supabase
            .from("owner_emergency_defaults")
            .select("owner_phone, avian_vet_name, avian_vet_phone, avian_vet_address")
            .eq("owner_id", u.user.id)
            .maybeSingle()
        : { data: null };
      const byBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
      // Per contact row (a bird's own vet never borrows the account's number).
      const eff = (c: any, k: string) => (mergeEmergency(c, defaults as any) as Record<string, string | null>)[k] ?? "";
      const missing = birds
        .map((b) => {
          const c = byBird.get(b.id);
          const needs: string[] = [];
          if (!eff(c, "owner_phone")) needs.push(t("sitCard.needYourPhone", "your phone"));
          if (!eff(c, "avian_vet_phone")) needs.push(t("sitCard.needVetPhone", "avian vet phone"));
          return needs.length ? `${b.name}: ${needs.join(" & ")}` : null;
        })
        .filter(Boolean);
      if (missing.length) {
        toast.error(
          t("sitCard.missingContacts", "Add the required emergency contacts before sharing — {{missing}}. Set account defaults on the dashboard or fill the bird's Emergency tab.", { missing: missing.join("; ") }),
          { duration: 8000 },
        );
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success(t("sitCard.linkCopied", "Link copied."));
  }

  return (
    <div className="rounded-[20px] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {sit.title?.trim() && (
            <p className="truncate text-[15px] font-medium text-[#1a3d2e]">{sit.title}</p>
          )}
          <div className={`flex items-center gap-2 ${sit.title?.trim() ? "mt-0.5 text-xs text-[#5f5e5a]" : "text-sm font-medium"}`}>
            <Calendar className="size-4 shrink-0 text-[#5f5e5a]" />
            {formatDateRangeUS(sit.start_date, sit.end_date)}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>
      </div>
      {isHousehold ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-[#5f5e5a]">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#cfe3dc] text-[10px] font-medium text-[#1a5e3f]">
            {((caregiverName ?? "?").slice(0, 1) || "?").toUpperCase()}
          </span>
          <span>
            <Trans
              i18nKey="sitCard.coveredBy"
              defaults="Covered by <b>{{name}}</b>"
              values={{ name: caregiverName ?? t("sitCard.householdMemberLower", "household member") }}
              components={{ b: <span className="font-medium text-[#1a3d2e]" /> }}
            />
          </span>
          <span className="rounded-full bg-[#cfe3dc] px-1.5 py-0.5 text-[10px] font-medium text-[#1a5e3f]">{t("sitCard.household", "Household")}</span>
        </div>
      ) : (
        <p className="mt-1 text-xs text-[#5f5e5a]">
          {t("sitCard.sitterLabel", "Sitter: {{name}}", { name: sit.sitter_name?.trim() || t("sitCard.notNamedYet", "Not named yet") })}{sit.sitter_email && ` (${sit.sitter_email})`}
        </p>
      )}
      {birds.length > 0 && (
        <p className="mt-1 text-[13px] text-[#5f5e5a]">
          {namesAsCount(birds.map((b) => b.name))
            ? <span className="font-medium">{t("birdNames.count", "{{count}} birds", { count: birds.length })}</span>
            : <>{t("sitCard.birdsLabel", "Birds:")} <span className="font-medium">{birds.map((b) => b.name).join(", ")}</span></>}
        </p>
      )}
      {/* Per-trip link strip — external sitter only; household has no token. */}
      {!isHousehold && !sit.revoked && !expired && (
        <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[#f1f5f0] p-2">
          <Link2 className="size-3.5 text-[#5f5e5a]" />
          <span className="flex-1 truncate text-[13px] text-[#5f5e5a]">{url}</span>
          <button onClick={copy} className="grid size-11 shrink-0 place-items-center rounded-full text-[#1a3d2e]" aria-label={t("sitCard.copyLink", "Copy link")}><Copy className="size-3.5" /></button>
        </div>
      )}
      {!sit.revoked && (
        <SitChecklist sit={sit} birds={birds} onSitChanged={onChange} />
      )}
      {/* Household caregivers use the app itself — there's no sitter view to preview. */}
      {!isHousehold && birds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          <span className="text-[#5f5e5a]">{t("sitCard.previewAsSitter", "Preview as your sitter:")}</span>
          {birds.map((b) => (
            <Link key={b.id} to="/birds/$birdId/view-as-sitter" params={{ birdId: b.id }} className="inline-flex items-center gap-1 text-[#1a3d2e] underline">
              <Eye className="size-3" /> {birds.length === 1 ? t("sitCard.view", "View") : b.name}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-4 text-xs font-medium [&>*]:inline-flex [&>*]:min-h-[44px] [&>*]:items-center">
        {allBirds && !sit.revoked && (
          <button onClick={() => navigate({ to: "/sits/edit/$sitId", params: { sitId: sit.id } })} className="text-[#1a3d2e] underline">{t("sitCard.edit", "Edit")}</button>
        )}
        <Link to="/sits/$sitId" params={{ sitId: sit.id }} className="text-[#1a3d2e] underline">{t("sitCard.activity", "Activity")}</Link>
        {!isHousehold && !sit.revoked && !expired && (
          <button onClick={revoke} className="text-[#5f5e5a] underline">{t("sitCard.revokeLink", "Revoke link")}</button>
        )}
        <button onClick={remove} className="ml-auto text-[#5f5e5a] underline">{t("sitCard.delete", "Delete")}</button>
      </div>
      {confirmSheet}
    </div>
  );
}
