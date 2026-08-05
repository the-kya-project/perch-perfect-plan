import { AlertTriangle, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

// Body-care guidance for when a bird has passed. COPY-EXACT and medically
// specific — a real person acts on these steps. Do not paraphrase:
//   - necropsy path = refrigerate, NEVER freeze
//   - burial/cremation path = freezer
// The two are intentionally opposite. This content is never ambient: it renders
// only after the owner confirms mark-as-passed, or after the sitter pauses
// reminders and taps the path the owner chose.

export type PassingPath = "necropsy" | "burial" | "vet";

export type VetContact = { name: string | null; phone: string | null };

export const PATH_CHOICE_LABELS: Record<PassingPath, (name: string) => string> = {
  necropsy: (name) => `Keep ${name} for a necropsy`,
  burial: (name) => `Prepare ${name} for burial or cremation`,
  vet: (name) => `Bring ${name} to the vet`,
};

function Steps({ steps }: { steps: string[] }) {
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

function VetRow({ vet }: { vet: VetContact }) {
  const { t } = useTranslation();
  if (!vet.phone) return null;
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

function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="t-meta pt-1 leading-relaxed">{children}</p>;
}

/**
 * One path's detail block. `audience` controls the sitter-context framing lines
 * ("{Owner} would like…", "You've done the hard part."): the sitter sees them;
 * the owner (who made the choice themselves) sees the same headings, steps,
 * callouts, and notes without the third-person framing.
 */
export function PathDetail({
  path, name, ownerName, vet, audience,
}: {
  path: PassingPath;
  name: string;
  ownerName: string;
  vet: VetContact;
  audience: "owner" | "sitter";
}) {
  const { t } = useTranslation();
  const sitter = audience === "sitter";

  if (path === "necropsy") {
    return (
      <div className="space-y-3">
        <h2 className="t-section">{t("passingGuidance.necropsyTitle", "Keeping {{name}} cool for the vet", { name })}</h2>
        {sitter && (
          <p className="t-body leading-relaxed text-[var(--ink2)]">
            {t("passingGuidance.necropsyIntro", "{{ownerName}} would like a necropsy to understand what happened. It's time sensitive, so it helps to act soon.", { ownerName })}
          </p>
        )}
        <Steps steps={[
          t("passingGuidance.stepWrapTowel", "Gently wrap {{name}} in a towel.", { name }),
          t("passingGuidance.stepPlasticBag", "Place them in a plastic bag."),
          t("passingGuidance.stepRefrigerate", "Put them in the refrigerator, not the freezer."),
        ]} />
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--amber-fill)" }}>
          <AlertTriangle className="mt-0.5 size-5 shrink-0" style={{ color: "var(--amber-ink)" }} />
          <p className="text-[14px] font-[500] leading-relaxed" style={{ color: "var(--amber-ink)" }}>
            {t("passingGuidance.necropsyWarning", "Refrigerate, never freeze. Freezing damages what the vet needs to look at.")}
          </p>
        </div>
        <p className="t-body leading-relaxed text-[var(--ink2)]">
          {t("passingGuidance.necropsyTransport", "Depending on how far the vet is, you may need to keep {{name}} cool for the drive. Call the vet, they'll tell you exactly how to transport them.", { name })}
        </p>
        <VetRow vet={vet} />
        <Disclaimer>{t("passingGuidance.necropsyDisclaimer", "Gentle starting points, not medical advice. The vet will guide the specifics.")}</Disclaimer>
      </div>
    );
  }

  if (path === "burial") {
    return (
      <div className="space-y-3">
        <h2 className="t-section">{t("passingGuidance.burialTitle", "Keeping {{name}} safe until then", { name })}</h2>
        {sitter && (
          <p className="t-body leading-relaxed text-[var(--ink2)]">
            {t("passingGuidance.burialIntro", "{{ownerName}} would like to bury {{name}} or arrange cremation when she's back. Here's how to keep them safe until then.", { ownerName, name })}
          </p>
        )}
        <Steps steps={[
          t("passingGuidance.stepWrapTowelCloth", "Gently wrap {{name}} in a towel or soft cloth.", { name }),
          t("passingGuidance.stepPlasticBag", "Place them in a plastic bag."),
          t("passingGuidance.stepFreezer", "Put them in the freezer until {{ownerName}} is ready.", { ownerName }),
        ]} />
        {sitter && (
          <p className="t-body leading-relaxed text-[var(--ink2)]">
            {t("passingGuidance.burialReassure", "{{ownerName}} will take it from here when she's back. You've done the hard part.", { ownerName })}
          </p>
        )}
        <Disclaimer>{sitter ? t("passingGuidance.burialDisclaimerSitter", "Do what feels right. {{ownerName}} will guide anything else.", { ownerName }) : t("passingGuidance.burialDisclaimerOwner", "Do what feels right. Your avian vet can guide anything else.")}</Disclaimer>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="t-section">{t("passingGuidance.vetTitle", "Bringing {{name}} to the vet", { name })}</h2>
      {sitter && (
        <p className="t-body leading-relaxed text-[var(--ink2)]">
          {t("passingGuidance.vetIntro", "{{ownerName}} would like {{name}} brought to the vet, who can care for them and talk through options.", { ownerName, name })}
        </p>
      )}
      <Steps steps={[
        t("passingGuidance.stepWrapTowel", "Gently wrap {{name}} in a towel.", { name }),
        t("passingGuidance.stepPlasticBagBox", "Place them in a plastic bag or a small box for the trip."),
        t("passingGuidance.stepBringToVet", "Bring them to the vet. Calling ahead helps them be ready."),
      ]} />
      <p className="t-body leading-relaxed text-[var(--ink2)]">
        {t("passingGuidance.vetTransport", "Call the vet before you go, they'll let you know if there's anything you need to do for the drive.")}
      </p>
      <VetRow vet={vet} />
      <Disclaimer>{t("passingGuidance.vetDisclaimer", "The vet will guide you from there.")}</Disclaimer>
    </div>
  );
}
