import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { joinWaitlist } from "@/lib/waitlist.functions";

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

const inputCls =
  "w-full rounded-[12px] border border-[#1a3d2e]/15 bg-white px-3.5 py-2.5 text-base text-[#1a3d2e] placeholder:text-[#9a978c] outline-none focus:border-[#1a3d2e]/40";

// Lime community-waitlist card on Explore — the single accent moment. The button
// opens a popup form whose fields map 1:1 to the Brevo waitlist form.
export function WaitlistCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[22px] bg-[#cdeab0] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#3f5e22]">Coming soon</p>
      <h2 className="mt-1.5 text-xl font-medium text-[#1f3d12]">Join the community</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#3f5e22]">
        A place for parrot people. Experience expert AMAs, local chapters, and a community that gives back to rescue.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
      >
        Join the waitlist
      </button>
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </section>
  );
}

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const join = useServerFn(joinWaitlist);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [chapterLead, setChapterLead] = useState<"1" | "2" | "">("");
  const [chapter, setChapter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Close on Esc; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !chapterLead || !chapter) {
      toast.error("Please fill in every field.");
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
      else toast.error("Couldn't add you just now. Please try again.");
    } catch {
      toast.error("Couldn't add you just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-[#f4f1e8] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-medium text-[#1a3d2e]">
            {done ? "You're on the list!" : "Join the community waitlist"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-1.5 text-[#5f5e5a] hover:bg-black/5">
            <X className="size-5" />
          </button>
        </div>

        {done ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-[14px] bg-[#cdeab0] px-4 py-3 text-sm font-medium text-[#1f3d12]">
              <Check className="size-4 shrink-0" />
              Thanks for joining — we'll email you when the community opens.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="First name">
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={inputCls} />
              </Field>
              <Field label="Last name">
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className={inputCls} />
              </Field>
            </div>
            <Field label="Email">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputCls} />
            </Field>

            <Field label="Would you be interested in leading a local chapter?">
              <div className="grid grid-cols-2 gap-2">
                {([["1", "Yes"], ["2", "No"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setChapterLead(val)}
                    className={`rounded-[12px] border px-3 py-2.5 text-sm font-medium transition ${
                      chapterLead === val
                        ? "border-[#1a3d2e] bg-[#1a3d2e] text-white"
                        : "border-[#1a3d2e]/15 bg-white text-[#1a3d2e]"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Where are you located?">
              <select value={chapter} onChange={(e) => setChapter(e.target.value)} className={`${inputCls} appearance-none`}>
                <option value="">Select your region</option>
                {CHAPTERS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="!mt-5 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50"
            >
              {submitting ? "Joining…" : "Join the waitlist"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}
