// Rescue partner codes (backlog 1.16): the adoption card admins approve or
// decline, on /admin/rescues and in /admin/review → Rescues. Flock code only.
import { useTranslation } from "react-i18next";
import { K, KyaHeading } from "@/components/kya";
import { timeAgo } from "@/components/flock/PostParts";
import { adoptedLabel, type RescueRedemption } from "@/lib/flockRescue";

/** "Sunny · Sun conure", "Birds and Beaks · adopted Nov 15" (the mockup's
 *  card), with who sent it and when, then Approve and Decline. A founder
 *  can't be approved, so their card says so instead. */
export function RescueAdoptionCard({ r, busy, onApprove, onDecline }: {
  r: RescueRedemption; busy: boolean; onApprove: () => void; onDecline: () => void;
}) {
  const { t, i18n } = useTranslation();
  const btn = "min-h-[44px] flex-1 rounded-full px-3 text-[14px] font-[700] disabled:opacity-50";
  return (
    <article className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-queue-item="rescue" data-subject={r.redemption_id}>
      <span className="text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }} data-testid="queue-item-label">
        {t("flock.rescueAdmin.label", "Rescue adoption")}
      </span>
      <KyaHeading size={18} as="h2">{t("flock.rescueAdmin.bird", "{{bird}} · {{species}}", { bird: r.bird_name, species: r.species })}</KyaHeading>
      <span className="text-[14px] font-[700]" style={{ color: K.ink }}>
        {t("flock.rescueAdmin.adopted", "{{rescue}} · adopted {{date}}", { rescue: r.partner_name, date: adoptedLabel(r.adopted_on, i18n.language) })}
      </span>
      <span className="text-[13px]" style={{ color: K.quiet }}>
        {[r.account_name ? t("flock.rescueAdmin.from", "From {{name}}", { name: r.account_name }) : null, timeAgo(t, r.created_at, i18n.language)].filter(Boolean).join(" · ")}
      </span>
      {r.has_founding && (
        <p className="m-0 rounded-[12px] px-3 py-2 text-[14px] font-[700]" style={{ background: K.amberBg, color: K.amberText }} data-testid="rescue-founder-note">
          {t("flock.rescueAdmin.founder", "This account has a founding spot, so it can't use a rescue code. Decline it.")}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className={btn} style={{ background: K.forest, color: "#fff" }} disabled={busy || r.has_founding} data-act="approve" onClick={onApprove}>
          {t("flock.review.approve", "Approve")}
        </button>
        <button type="button" className={btn} style={{ background: "#fff", color: K.forest, border: `1.5px solid ${K.forest}` }} disabled={busy} data-act="decline" onClick={onDecline}>
          {t("flock.review.decline", "Decline")}
        </button>
      </div>
    </article>
  );
}
