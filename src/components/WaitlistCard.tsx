import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { joinWaitlist } from "@/lib/waitlist.functions";
import { K, KyaHeading, KyaPrimaryButton, KyaRequiredTag, KyaSheet } from "@/components/kya";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

// Region options mirror the Brevo form's PRIMARY_CHAPTER select (value = Brevo
// category id).
const CHAPTERS: { value: string; label: string }[] = [
  { value: "1", label: "California" },
  { value: "2", label: "Florida" },
  { value: "3", label: "Great Lakes (IL, IN, MI, OH)" },
  { value: "4", label: "Mid-Atlantic (PA, NJ, MD, DE, DC, VA)" },
  { value: "5", label: "Northeast (NY, MA, CT, RI, VT, NH, ME)" },
  { value: "6", label: "Pacific Northwest (WA, OR)" },
  { value: "7", label: "Southeast (GA, NC, SC, TN)" },
  { value: "8", label: "Southwest (AZ, NM, NV)" },
  { value: "9", label: "Texas" },
];

// Display-only labels (the submitted value is the Brevo id above).
function chapterLabel(t: TFunction, value: string, en: string): string {
  switch (value) {
    case "1": return t("waitlist.chapter.california", "California");
    case "2": return t("waitlist.chapter.florida", "Florida");
    case "3": return t("waitlist.chapter.greatLakes", "Great Lakes (IL, IN, MI, OH)");
    case "4": return t("waitlist.chapter.midAtlantic", "Mid-Atlantic (PA, NJ, MD, DE, DC, VA)");
    case "5": return t("waitlist.chapter.northeast", "Northeast (NY, MA, CT, RI, VT, NH, ME)");
    case "6": return t("waitlist.chapter.pacificNorthwest", "Pacific Northwest (WA, OR)");
    case "7": return t("waitlist.chapter.southeast", "Southeast (GA, NC, SC, TN)");
    case "8": return t("waitlist.chapter.southwest", "Southwest (AZ, NM, NV)");
    case "9": return t("waitlist.chapter.texas", "Texas");
    default: return en;
  }
}

const inputCls = "min-h-[48px] w-full rounded-full border-[1.5px] bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f]";
const inputStyle = { borderColor: "#d5dfd5", color: "#1a3d2e" };

// Lime community-waitlist card on Explore — the single accent moment. The button
// opens a popup form whose fields map 1:1 to the Brevo waitlist form.
export function WaitlistCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[20px] p-5" style={{ background: K.lime, color: K.forest }}>
      <span className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-[700] text-white" style={{ background: K.forest }}>{t("waitlist.comingSoonTag", "Coming soon")}</span>
      <KyaHeading size={21} className="mt-2.5">{t("waitlist.joinTheCommunity", "Join the community")}</KyaHeading>
      <p className="m-0 mt-2 text-[15px] leading-[1.5]">
        {t("waitlist.cardBodyShort", "A place for parrot people. Expert AMAs, local chapters, and a community that gives back to rescue.")}
      </p>
      <div className="mt-4"><KyaPrimaryButton onClick={() => setOpen(true)}>{t("waitlist.joinTheWaitlist", "Join the waitlist")}</KyaPrimaryButton></div>
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </section>
  );
}

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const join = useServerFn(joinWaitlist);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [chapterLead, setChapterLead] = useState<"1" | "2" | "">("");
  const [chapter, setChapter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !chapterLead || !chapter) {
      toast.error(t("waitlist.fillEveryField", "Please fill in every field."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await join({
        data: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          chapterLeadInterest: chapterLead,
          primaryChapter: chapter,
        },
      });
      if (res?.ok) setDone(true);
      else toast.error(t("waitlist.couldntAdd", "Couldn't add you just now. Please try again."));
    } catch {
      toast.error(t("waitlist.couldntAdd", "Couldn't add you just now. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("waitlist.close", "Close")}
      title={<KyaHeading size={24}>{done ? t("waitlist.onTheListTitle", "You're on the list") : t("waitlist.modalTitle", "Join the community waitlist")}</KyaHeading>}
    >
      {done ? (
        <div>
          <div className="flex items-center gap-2 rounded-[16px] px-4 py-3 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>
            <Check className="size-4 shrink-0" />
            {t("waitlist.thanks", "Thanks for joining — we'll email you when the community opens.")}
          </div>
          <div className="mt-4"><KyaPrimaryButton onClick={onClose}>{t("waitlist.done", "Done")}</KyaPrimaryButton></div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("waitlist.firstName", "First name")}>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={inputCls} style={inputStyle} />
            </Field>
            <Field label={t("waitlist.lastName", "Last name")}>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label={t("waitlist.email", "Email")}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputCls} style={inputStyle} />
          </Field>

          <Field label={t("waitlist.leadChapterQ", "Would you be interested in leading a local chapter?")}>
            <div className="grid grid-cols-2 gap-2">
              {([["1", t("waitlist.yes", "Yes")], ["2", t("waitlist.no", "No")]] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setChapterLead(val)}
                  aria-pressed={chapterLead === val}
                  className="min-h-[48px] rounded-full border-[1.5px] px-3 text-[15px] font-[700]"
                  style={chapterLead === val ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#d5dfd5", color: K.forest }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("waitlist.whereLocated", "Where are you located?")}>
            <select value={chapter} onChange={(e) => setChapter(e.target.value)} className={`${inputCls} appearance-none`} style={inputStyle}>
              <option value="">{t("waitlist.selectRegion", "Select your region")}</option>
              {CHAPTERS.map((c) => (
                <option key={c.value} value={c.value}>{chapterLabel(t, c.value, c.label)}</option>
              ))}
            </select>
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 text-[16px] font-[700] disabled:opacity-45"
            style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
          >
            {submitting ? t("waitlist.joining", "Joining…") : t("waitlist.joinTheWaitlist", "Join the waitlist")}
          </button>
        </form>
      )}
    </KyaSheet>
  );
}

// Every waitlist field is required, so each label carries the Required tag.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-[700] text-[#1a3d2e]">{label}<KyaRequiredTag tone="forest">{t("waitlist.required", "Required")}</KyaRequiredTag></span>
      {children}
    </label>
  );
}
