import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaField, KyaGroupLabel, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSheet, KyaSwitch, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { RescueAdoptionCard } from "@/components/flock/RescueParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import {
  cleanRescueCode, parseUseLimit, pauseRescuePartner, rescueErrorKind, RESCUE_LIMITS, reviewRescue, saveRescuePartner,
  useInvalidateRescue, useRescuePartners, useRescueRedemptions, type RescuePartner,
} from "@/lib/flockRescue";

// Rescue partners, for admins (backlog 1.16, mockup docs/flock/mockups/SpecRescueCodes.dc.html,
// screen 3, without its "Sponsored seats" card: seats aren't counted). Adoptions
// waiting for confirmation (Approve gives six months in the Flock, Decline
// gives nothing), then every partner rescue with its code and how many
// adoptions it has had, Edit, and Add a partner rescue. Editing changes the
// name, code and optional limit, and pauses or restarts the code. There's no
// delete: a partner with adoptions is paused instead. The same adoptions show
// in /admin/review → Rescues. Behind the Flock gate, then admins only (the
// database refuses everyone else, whatever this page shows).
export const Route = createFileRoute("/_authenticated/admin/rescues")({
  head: () => ({ meta: [{ title: "Rescue partners — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><AdminRescues /></AdminOnly>,
});

type Draft = { id: string | null; name: string; code: string; limit: string; paused: boolean };

function AdminRescues() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();
  const { data: partners, isLoading, isError } = useRescuePartners(isAdmin === true);
  const { data: pending } = useRescueRedemptions("pending", isAdmin === true);
  const invalidate = useInvalidateRescue();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (id: string, decision: "approve" | "decline") => {
    setBusy(id); setError(null);
    try { await reviewRescue(id, decision); await invalidate(); }
    catch (e) {
      setError(rescueErrorKind(e) === "founder"
        ? t("flock.rescueAdmin.founder", "This account has a founding spot, so it can't use a rescue code. Decline it.")
        : t("flock.review.error", "That didn't save. Try again."));
    }
    finally { setBusy(null); }
  };

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock/you" })} />
        <KyaTitle title={t("flock.rescueAdmin.title", "Rescue partners")} line={t("flock.rescueAdmin.line", "Admin · each adoption gives six months in the Flock, free")} />
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-3">
          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
          {(pending ?? []).length > 0 && (
            <section className="flex flex-col gap-2.5" data-testid="rescue-pending-list">
              <KyaGroupLabel>{t("flock.rescueAdmin.waiting", "Waiting for confirmation")}</KyaGroupLabel>
              {(pending ?? []).map((r) => (
                <RescueAdoptionCard key={r.redemption_id} r={r} busy={busy === r.redemption_id}
                  onApprove={() => void review(r.redemption_id, "approve")}
                  onDecline={() => void review(r.redemption_id, "decline")} />
              ))}
            </section>
          )}

          <KyaGroupLabel className="mt-2">{t("flock.rescueAdmin.partners", "Partners")}</KyaGroupLabel>
          {isLoading
            ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
            : isError
              ? <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{t("flock.rescueAdmin.loadError", "We couldn't load the partners. Try again.")}</p>
              : (partners ?? []).length === 0
                ? (
                  <div className="rounded-[18px] bg-white p-5 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="rescue-partners-empty">
                    {t("flock.rescueAdmin.empty", "No partner rescues yet. Add one to give it a code for its adopters.")}
                  </div>
                )
                : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="rescue-partners">
                    {(partners ?? []).map((p) => <PartnerRow key={p.partner_id} p={p} onEdit={() => setDraft(toDraft(p))} />)}
                  </ul>
                )}
          <button type="button" onClick={() => setDraft({ id: null, name: "", code: "", limit: "", paused: false })} data-testid="rescue-add"
            className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] bg-white px-5 text-[15px] font-[700]"
            style={{ borderColor: K.forest, color: K.forest }}>
            <Plus className="size-4" aria-hidden="true" />{t("flock.rescueAdmin.add", "Add a partner rescue")}
          </button>
        </div>
      </KyaBody>
      {draft && <PartnerSheet draft={draft} onClose={() => setDraft(null)} onSaved={async () => { await invalidate(); setDraft(null); }} />}
    </KyaPage>
  );
}

function toDraft(p: RescuePartner): Draft {
  return { id: p.partner_id, name: p.name, code: p.code, limit: p.use_limit == null ? "" : String(p.use_limit), paused: p.paused };
}

function PartnerRow({ p, onEdit }: { p: RescuePartner; onEdit: () => void }) {
  const { t } = useTranslation();
  const uses = p.use_limit == null
    ? t("flock.rescueAdmin.redeemed", "{{count}} redeemed", { count: p.approved })
    : t("flock.rescueAdmin.redeemedOf", "{{count}} of {{limit}} redeemed", { count: p.approved, limit: p.use_limit });
  return (
    <li className="flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-4 py-3" style={{ color: K.forest }} data-partner={p.partner_id} data-paused={p.paused || undefined}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-[15px] font-[700]">{p.name}</span>
        <span className="break-words text-[13px] leading-[1.4]" style={{ color: K.quiet }} data-testid="partner-line">
          {[p.code, uses, p.pending > 0 ? t("flock.rescueAdmin.pendingCount", "{{count}} waiting", { count: p.pending }) : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      {p.paused && (
        <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.amberBg, color: K.amberText }}>
          {t("flock.rescueAdmin.paused", "Paused")}
        </span>
      )}
      <button type="button" onClick={onEdit} className="inline-flex min-h-[44px] items-center px-1 text-[14px] font-[700]" style={{ color: K.moss }} data-testid="partner-edit">
        {t("flock.rescueAdmin.edit", "Edit")}
      </button>
    </li>
  );
}

function PartnerSheet({ draft: start, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [d, setD] = useState<Draft>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = cleanRescueCode(d.code);

  const save = async () => {
    const limit = parseUseLimit(d.limit);
    if (!d.name.trim()) { setError(t("flock.rescueAdmin.needName", "Add the rescue's name.")); return; }
    if (code.length < RESCUE_LIMITS.codeMin || code.length > RESCUE_LIMITS.codeMax) {
      setError(t("flock.rescueAdmin.needCode", "Codes are 4 to 30 letters or numbers.")); return;
    }
    if (limit === "bad") { setError(t("flock.rescueAdmin.needLimit", "Leave the limit blank, or use a whole number.")); return; }
    setSaving(true); setError(null);
    try {
      await saveRescuePartner({ id: d.id, name: d.name, code, useLimit: limit, paused: d.paused });
      await onSaved();
    } catch (e) {
      setError(rescueErrorKind(e) === "code_taken"
        ? t("flock.rescueAdmin.codeTaken", "Another partner already uses that code.")
        : t("flock.review.error", "That didn't save. Try again."));
      setSaving(false);
    }
  };

  const togglePause = async (paused: boolean) => {
    if (!d.id) { setD({ ...d, paused }); return; }
    setSaving(true); setError(null);
    try { await pauseRescuePartner(d.id, paused); setD({ ...d, paused }); }
    catch { setError(t("flock.review.error", "That didn't save. Try again.")); }
    finally { setSaving(false); }
  };

  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")}
      title={<KyaHeading size={23}>{d.id ? t("flock.rescueAdmin.editTitle", "Edit partner rescue") : t("flock.rescueAdmin.addTitle", "Add a partner rescue")}</KyaHeading>}>
      <div className="flex flex-col gap-4" data-testid="partner-sheet">
        <KyaField id="partner-name" label={t("flock.rescueAdmin.name", "Rescue name")} value={d.name} maxLength={RESCUE_LIMITS.partnerName}
          onChange={(e) => setD({ ...d, name: e.target.value })} data-testid="partner-name" autoComplete="off" />
        <KyaField id="partner-code" label={t("flock.rescueAdmin.code", "Code")} value={d.code} maxLength={40}
          onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} data-testid="partner-code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          placeholder="BIRDSANDBEAKS" className="font-[700] tracking-[0.06em]"
          hint={t("flock.rescueAdmin.codeHint", "One code the rescue shares with every adopter. Letters and numbers only.")} />
        <KyaField id="partner-limit" label={t("flock.rescueAdmin.limit", "Limit on uses (optional)")} value={d.limit} inputMode="numeric"
          onChange={(e) => setD({ ...d, limit: e.target.value })} data-testid="partner-limit" autoComplete="off"
          hint={t("flock.rescueAdmin.limitHint", "Leave blank for no limit. Adoptions waiting and approved both count.")} />
        <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] bg-white px-4 py-2" data-testid="partner-pause">
          <span className="text-[15.5px] font-[700]" style={{ color: K.forest }}>{t("flock.rescueAdmin.pause", "Pause this code")}</span>
          <KyaSwitch checked={d.paused} onChange={(v) => void togglePause(v)} disabled={saving} label={t("flock.rescueAdmin.pause", "Pause this code")} />
        </div>
        <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("flock.rescueAdmin.pauseHint", "While it's paused, adopters can't use the code. Adoptions already sent can still be approved.")}
        </p>
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
        <KyaPrimaryButton onClick={() => void save()} disabled={saving}>
          {saving ? t("flock.rescueAdmin.saving", "Saving…") : d.id ? t("flock.rescueAdmin.save", "Save changes") : t("flock.rescueAdmin.create", "Add partner")}
        </KyaPrimaryButton>
      </div>
    </KyaSheet>
  );
}
