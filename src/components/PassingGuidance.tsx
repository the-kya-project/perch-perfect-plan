import { AlertTriangle, Phone, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading } from "@/components/kya";

// Body-care guidance for when a bird has passed. COPY-EXACT and medically
// specific — a real person acts on these steps. Do not paraphrase:
//   - necropsy path = refrigerate, NEVER freeze
//   - burial/cremation path = freezer
// The two are intentionally opposite. This content is never ambient: it renders
// only after the owner confirms mark-as-passed, or after the sitter pauses
// reminders and taps the path the owner chose.

export type PassingPath = "necropsy" | "burial" | "vet";

export type VetContact = { name: string | null; phone: string | null };

/** Visual variant. Omitted = the original look, which the sitter view renders
 *  and must keep unchanged. "kya" = the current owner-app text styles, used
 *  only by the authenticated screens (farewell, covering-member concern). */
export type GuidanceLook = "kya";

export const PATH_CHOICE_LABELS: Record<PassingPath, (name: string) => string> = {
  necropsy: (name) => `Keep ${name} for a necropsy`,
  burial: (name) => `Prepare ${name} for burial or cremation`,
  vet: (name) => `Bring ${name} to the vet`,
};

function Steps({ steps, look }: { steps: string[]; look?: GuidanceLook }) {
  if (look === "kya") {
    return (
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-[16px] border bg-white p-3" style={{ borderColor: K.line }}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-[700]" style={{ background: K.lime, color: K.forest }}>{i + 1}</span>
            <span className="pt-0.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{s}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-[var(--line2)]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--pale)] text-[12px] font-[600] text-[var(--ink)]">{i + 1}</span>
          <span className="t-body pt-0.5 text-[var(--ink)]">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function VetRow({ vet, look }: { vet: VetContact; look?: GuidanceLook }) {
  const { t } = useTranslation();
  if (!vet.phone) return null;
  if (look === "kya") {
    // Same look as a row in the emergency info list (EmergencyContacts):
    // forest avatar, muted label, bold name, phone, round call button.
    const callLabel = vet.name ? t("passingGuidance.callVetNamed", "Call {{name}}", { name: vet.name }) : t("passingGuidance.callVet", "Call the vet");
    return (
      <div className="flex min-h-[64px] items-center gap-3 rounded-[16px] border bg-white px-4 py-2.5" style={{ borderColor: K.line, color: K.forest }}>
        <span className="grid size-[42px] shrink-0 place-items-center rounded-full" style={{ background: K.forest, color: K.lime }} aria-hidden="true">
          <Stethoscope className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px]" style={{ color: K.quiet }}>{t("passingGuidance.vetLabel", "Vet")}</span>
          <span className="mt-0.5 block truncate text-[15px] font-[700]">{vet.name || vet.phone}</span>
          {vet.name && <span className="block truncate text-[13px]" style={{ color: K.quiet }}>{vet.phone}</span>}
        </span>
        <a
          href={`tel:${vet.phone.replace(/[^\d+]/g, "")}`}
          aria-label={callLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full border-2 bg-white active:scale-95"
          style={{ borderColor: K.forest, color: K.forest }}
        >
          <Phone className="size-[18px]" />
        </a>
      </div>
    );
  }
  return (
    <a
      href={`tel:${vet.phone}`}
      className="flex min-h-[52px] items-center gap-3 rounded-xl bg-[var(--ink)] px-4 text-white active:scale-[0.99]"
    >
      <Phone className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-[500] leading-tight">{vet.name ? t("passingGuidance.callVetNamed", "Call {{name}}", { name: vet.name }) : t("passingGuidance.callVet", "Call the vet")}</span>
        <span className="block text-[12px] opacity-80">{vet.phone}</span>
      </span>
    </a>
  );
}

function Title({ children, look }: { children: React.ReactNode; look?: GuidanceLook }) {
  return look === "kya" ? <KyaHeading size={21}>{children}</KyaHeading> : <h2 className="t-section">{children}</h2>;
}

function Disclaimer({ children, look }: { children: React.ReactNode; look?: GuidanceLook }) {
  if (look === "kya") return <p className="m-0 pt-1 text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>{children}</p>;
  return <p className="t-meta pt-1 leading-relaxed">{children}</p>;
}

/**
 * One path's detail block. `audience` controls the sitter-context framing lines
 * ("{Owner} would like…", "You've done the hard part."): the sitter sees them;
 * the owner (who made the choice themselves) sees the same headings, steps,
 * callouts, and notes without the third-person framing.
 */
export function PathDetail({
  path, name, ownerName, vet, audience, look,
}: {
  path: PassingPath;
  name: string;
  ownerName: string;
  vet: VetContact;
  audience: "owner" | "sitter";
  /** Owner-app styling; leave unset in the sitter view. */
  look?: GuidanceLook;
}) {
  const { t } = useTranslation();
  const sitter = audience === "sitter";
  const kya = look === "kya";
  // Per-look text styles. Without `look` these are exactly the original
  // classes, so the sitter rendering is unchanged.
  const bodyCls = kya ? "m-0 text-[15px] leading-[1.5]" : "t-body leading-relaxed text-[var(--ink2)]";
  const bodyStyle = kya ? { color: K.ink } : undefined;
  const wrapCls = kya ? "flex flex-col gap-3" : "space-y-3";

  if (path === "necropsy") {
    return (
      <div className={wrapCls}>
        <Title look={look}>{t("passingGuidance.necropsyTitle", "Keeping {{name}} cool for the vet", { name })}</Title>
        {sitter && (
          <p className={bodyCls} style={bodyStyle}>
            {t("passingGuidance.necropsyIntro", "{{ownerName}} would like a necropsy to understand what happened. It's time sensitive, so it helps to act soon.", { ownerName })}
          </p>
        )}
        <Steps steps={[
          t("passingGuidance.stepWrapTowel", "Gently wrap {{name}} in a towel.", { name }),
          t("passingGuidance.stepPlasticBag", "Place them in a plastic bag."),
          t("passingGuidance.stepRefrigerate", "Put them in the refrigerator, not the freezer."),
        ]} look={look} />
        <div className={kya ? "flex items-start gap-3 rounded-[16px] p-4" : "flex items-start gap-3 rounded-xl p-4"} style={{ background: kya ? K.amberBg : "var(--amber-fill)" }}>
          <AlertTriangle className="mt-0.5 size-5 shrink-0" style={{ color: kya ? K.amberText : "var(--amber-ink)" }} />
          <p className={kya ? "m-0 text-[15px] font-[700] leading-[1.5]" : "text-[14px] font-[500] leading-relaxed"} style={{ color: kya ? K.amberText : "var(--amber-ink)" }}>
            {t("passingGuidance.necropsyWarning", "Refrigerate, never freeze. Freezing damages what the vet needs to look at.")}
          </p>
        </div>
        <p className={bodyCls} style={bodyStyle}>
          {t("passingGuidance.necropsyTransport", "Depending on how far the vet is, you may need to keep {{name}} cool for the drive. Call the vet, they'll tell you exactly how to transport them.", { name })}
        </p>
        <VetRow vet={vet} look={look} />
        <Disclaimer look={look}>{t("passingGuidance.necropsyDisclaimer", "Gentle starting points, not medical advice. The vet will guide the specifics.")}</Disclaimer>
      </div>
    );
  }

  if (path === "burial") {
    return (
      <div className={wrapCls}>
        <Title look={look}>{t("passingGuidance.burialTitle", "Keeping {{name}} safe until then", { name })}</Title>
        {sitter && (
          <p className={bodyCls} style={bodyStyle}>
            {t("passingGuidance.burialIntro", "{{ownerName}} would like to bury {{name}} or arrange cremation once back home. Here's how to keep them safe until then.", { ownerName, name })}
          </p>
        )}
        <Steps steps={[
          t("passingGuidance.stepWrapTowelCloth", "Gently wrap {{name}} in a towel or soft cloth.", { name }),
          t("passingGuidance.stepPlasticBag", "Place them in a plastic bag."),
          sitter
            ? t("passingGuidance.stepFreezerSitter", "Put them in the freezer until {{ownerName}} is ready.", { ownerName })
            : t("passingGuidance.stepFreezerOwner", "Put them in the freezer until you're ready."),
        ]} look={look} />
        {sitter && (
          <p className={bodyCls} style={bodyStyle}>
            {t("passingGuidance.burialReassure", "{{ownerName}} will take it from here once home. You've done the hard part.", { ownerName })}
          </p>
        )}
        <Disclaimer look={look}>{sitter ? t("passingGuidance.burialDisclaimerSitter", "Do what feels right. {{ownerName}} will guide anything else.", { ownerName }) : t("passingGuidance.burialDisclaimerOwner", "Do what feels right. Your avian vet can guide anything else.")}</Disclaimer>
      </div>
    );
  }

  return (
    <div className={wrapCls}>
      <Title look={look}>{t("passingGuidance.vetTitle", "Bringing {{name}} to the vet", { name })}</Title>
      {sitter && (
        <p className={bodyCls} style={bodyStyle}>
          {t("passingGuidance.vetIntro", "{{ownerName}} would like {{name}} brought to the vet, who can care for them and talk through options.", { ownerName, name })}
        </p>
      )}
      <Steps steps={[
        t("passingGuidance.stepWrapTowel", "Gently wrap {{name}} in a towel.", { name }),
        t("passingGuidance.stepPlasticBagBox", "Place them in a plastic bag or a small box for the trip."),
        t("passingGuidance.stepBringToVet", "Bring them to the vet. Calling ahead helps them be ready."),
      ]} look={look} />
      <p className={bodyCls} style={bodyStyle}>
        {t("passingGuidance.vetTransport", "Call the vet before you go, they'll let you know if there's anything you need to do for the drive.")}
      </p>
      <VetRow vet={vet} look={look} />
      <Disclaimer look={look}>{t("passingGuidance.vetDisclaimer", "The vet will guide you from there.")}</Disclaimer>
    </div>
  );
}
