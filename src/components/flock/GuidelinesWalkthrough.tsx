import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { K, SERIF } from "@/components/kya";
import {
  FLOCK_CONTACT_EMAIL, WALKTHROUGH_STEPS, questionsLine, walkthroughLabels, walkthroughProgress,
  walkthroughScreen1, walkthroughScreen2, walkthroughScreen3, type IconKey,
} from "@/flock/guidelines/content";

// The community guidelines walk-through: three full screens before anyone
// enters the Flock (approved mockups: docs/mockups/flock-guidelines-agreement/
// 01–03). Screen 1 scrolls; 2 and 3 fit a 390×844 phone. The sunflower button
// is pinned at the bottom of each. The route (flock.agree.tsx) owns the step,
// saving and navigation; this file is only the look.

const MUTED = "#3d4f45";
const PALE = K.paleGreen; // #d6e8dc
const TRACK = "#2f5a47";
const FRAUNCES = "Fraunces, Georgia, serif";

/** The icons, as drawn in the mockups (24-unit viewBox, round strokes). */
const ICON_PATHS: Record<IconKey, ReactNode> = {
  researchers: <><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /><path d="M9 7h6" /></>,
  conservationists: <><path d="M12 3l6 9h-4l4 6H6l4-6H6z" /><path d="M12 18v3" /></>,
  owners: <><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M12 17s-3-1.8-3-3.6a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 1.8-3 3.6-3 3.6z" /></>,
  bowl: <><path d="M3 12h18a9 9 0 0 1-18 0z" /><circle cx="9" cy="8.5" r="2" /><circle cx="14.5" cy="8" r="2.5" /><path d="M11 6c0-2 1-3 3-4" /></>,
  feather: <><path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z" /><path d="M16 8L2 22" /><path d="M17.5 15H9" /></>,
  house: <><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  speech: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
};

function Icon({ name, size, color }: { name: IconKey; size: number; color: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

function Circle({ size, bg, children }: { size: number; bg: string; children: ReactNode }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-full" style={{ width: size, height: size, background: bg }}>
      {children}
    </span>
  );
}

/** The forest header: back arrow (screens 2 and 3), the three-part progress
 *  bar and "n of 3", then the title and line. */
function Header({ step, title, line, onBack, titleSize, compact }: {
  step: number; title: string; line: string; onBack?: () => void; titleSize: number; compact: boolean;
}) {
  const { t } = useTranslation();
  const labels = walkthroughLabels(t);
  return (
    <div className="flex flex-col"
      style={{
        background: K.forest,
        gap: compact ? 12 : 10,
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${compact ? 20 : 16}px)`,
        paddingLeft: 24, paddingRight: 24, paddingBottom: compact ? 38 : 46,
      }}>
      <div className="flex items-center" style={{ gap: 10, height: 32 }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={labels.back} data-testid="walkthrough-back"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: K.lime }}>
            <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <div className="flex flex-1" style={{ gap: 6 }} role="progressbar" aria-valuemin={1} aria-valuemax={WALKTHROUGH_STEPS} aria-valuenow={step}
          aria-label={walkthroughProgress(t, step)}>
          {Array.from({ length: WALKTHROUGH_STEPS }, (_, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: 5, background: i < step ? K.lime : TRACK }} />
          ))}
        </div>
        <span className="text-[13px]" style={{ color: PALE }} data-testid="walkthrough-progress">{walkthroughProgress(t, step)}</span>
      </div>
      <h1 className="m-0 font-[700] text-white"
        style={{ fontFamily: SERIF, fontSize: titleSize, lineHeight: compact ? 1.08 : 1.06, letterSpacing: "-0.02em", marginTop: compact ? 8 : 10, textWrap: "balance" }}>
        {title}
      </h1>
      <p className="m-0" style={{ fontSize: compact ? 15 : 16, lineHeight: compact ? 1.55 : 1.5, color: PALE }}>{line}</p>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className="flex w-full items-center justify-center rounded-full font-[700] disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ height: 54, border: `2px solid ${K.forest}`, background: K.sunflower, color: K.forest, fontSize: 16, outlineColor: K.forest }}>
      {children}
    </button>
  );
}

/** The pinned footer, clear of the home indicator. */
function Footer({ children, divider }: { children: ReactNode; divider?: boolean }) {
  return (
    <div className="flex flex-none flex-col bg-white"
      style={{
        gap: 10, paddingTop: 14, paddingLeft: 22, paddingRight: 22,
        paddingBottom: "max(26px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
        borderTop: divider ? "1px solid #d5dfd5" : undefined,
      }}>
      {children}
    </div>
  );
}

/** The white sheet that overlaps the header by 24px with 22px top corners. */
function Sheet({ children, scroll, gap, pad }: { children: ReactNode; scroll: boolean; gap: number; pad: number }) {
  return (
    <div className={`flex flex-col bg-white ${scroll ? "" : "min-h-0 flex-1 overflow-y-auto"}`}
      style={{ marginTop: -24, borderRadius: "22px 22px 0 0", paddingTop: pad, paddingLeft: 22, paddingRight: 22, paddingBottom: scroll ? 28 : 8, gap }}>
      {children}
    </div>
  );
}

function ScreenOne({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const s = walkthroughScreen1(t);
  const h2 = { fontFamily: SERIF, fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.01em", textWrap: "balance" as const };
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white" data-testid="walkthrough-step-1">
      <div className="flex-1">
        <Header step={1} title={s.title} line={s.line} titleSize={34} compact={false} />
        <Sheet scroll gap={36} pad={28}>
          <section className="flex flex-col" style={{ gap: 16 }}>
            <h2 className="m-0 font-[700]" style={h2}>{s.bridgeTitle}</h2>
            <div className="grid grid-cols-3" style={{ gap: 8, background: K.mist, borderRadius: 18, padding: "16px 8px" }}>
              {s.communities.map((c) => (
                <div key={c.icon} className="flex flex-col items-center text-center" style={{ gap: 8 }}>
                  <Circle size={48} bg="#ffffff"><Icon name={c.icon} size={24} color={K.moss} /></Circle>
                  <span className="text-[13px] font-[700]" style={{ lineHeight: 1.3 }}>{c.label}</span>
                </div>
              ))}
            </div>
            <p className="m-0 text-[16px]" style={{ lineHeight: 1.55, color: MUTED }}>{s.bridgeBody}</p>
          </section>

          <section className="flex flex-col" style={{ gap: 14 }}>
            <h2 className="m-0 font-[700]" style={h2}>{s.advocateTitle}</h2>
            {s.advocate.map((a) => (
              <div key={a.icon} className="flex items-start" style={{ gap: 14, background: K.mist, borderRadius: 18, padding: 16 }}>
                <Circle size={40} bg={K.lime}><Icon name={a.icon} size={22} color={K.forest} /></Circle>
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <h3 className="m-0 text-[16px] font-[700]" style={{ lineHeight: 1.3 }}>{a.title}</h3>
                  <p className="m-0 text-[14px]" style={{ lineHeight: 1.5, color: MUTED }}>{a.body}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col" style={{ background: K.forest, borderRadius: 22, padding: "24px 22px", gap: 10 }}>
            <h2 className="m-0 font-[700]" style={{ ...h2, color: K.lime }}>{s.tableTitle}</h2>
            <p className="m-0 text-[16px]" style={{ lineHeight: 1.55, color: PALE }}>{s.tableBody}</p>
          </section>
        </Sheet>
      </div>
      <div className="sticky bottom-0">
        <Footer><PrimaryButton onClick={onNext} testId="walkthrough-next">{walkthroughLabels(t).next}</PrimaryButton></Footer>
      </div>
    </div>
  );
}

function ScreenTwo({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const s = walkthroughScreen2(t);
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-white" data-testid="walkthrough-step-2">
      <Header step={2} title={s.title} line={s.line} onBack={onBack} titleSize={30} compact />
      <Sheet scroll={false} gap={14} pad={22}>
        {s.rows.map((r) => (
          <div key={r.icon} className="flex items-start" style={{ gap: 12 }}>
            <Circle size={36} bg={K.lime}><Icon name={r.icon} size={20} color={K.forest} /></Circle>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <h2 className="m-0 font-[700]" style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.2 }}>{r.title}</h2>
              <p className="m-0 text-[14px]" style={{ lineHeight: 1.45, color: MUTED }}>{r.body}</p>
            </div>
          </div>
        ))}
      </Sheet>
      <Footer><PrimaryButton onClick={onNext} testId="walkthrough-next">{walkthroughLabels(t).next}</PrimaryButton></Footer>
    </div>
  );
}

function ScreenThree({ onBack, onAgree, onReadFull, saving, failed }: {
  onBack: () => void; onAgree: () => void; onReadFull: () => void; saving: boolean; failed: boolean;
}) {
  const { t } = useTranslation();
  const s = walkthroughScreen3(t);
  const q = questionsLine(t);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (failed) errorRef.current?.focus(); }, [failed]);
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ background: "#f4f7f4" }} data-testid="walkthrough-step-3">
      <Header step={3} title={s.title} line={s.line} onBack={onBack} titleSize={32} compact />
      <Sheet scroll={false} gap={12} pad={22}>
        <ol className="m-0 flex list-none flex-col p-0" style={{ gap: 12 }} data-testid="walkthrough-promises">
          {s.promises.map((p, i) => (
            <li key={i} className="flex items-start" style={{ gap: 12 }}>
              <span aria-hidden="true" className="flex flex-none items-center justify-center rounded-full"
                style={{ width: 30, height: 30, background: K.lime, fontFamily: FRAUNCES, fontStyle: "italic", fontSize: 16 }}>{i + 1}</span>
              <p className="m-0 text-[15px]" style={{ marginTop: 4, lineHeight: 1.45 }}>{p}</p>
            </li>
          ))}
        </ol>
        <button type="button" onClick={onReadFull} data-testid="walkthrough-read-full"
          className="self-start text-left text-[15px] font-[700]" style={{ marginTop: 2, color: K.moss }}>
          {s.readFull}
        </button>
      </Sheet>
      <Footer divider>
        {failed && (
          <p ref={errorRef} tabIndex={-1} role="alert" data-testid="walkthrough-error"
            className="m-0 rounded-[14px] px-3 py-2 text-center text-[14px] outline-none" style={{ lineHeight: 1.4, background: K.amberBg, color: K.amberText }}>
            {s.failed}
          </p>
        )}
        <PrimaryButton onClick={onAgree} disabled={saving} testId="walkthrough-agree">{saving ? s.saving : s.agree}</PrimaryButton>
        <p className="m-0 text-center text-[13px]" style={{ lineHeight: 1.4, color: K.quiet }}>
          {q.before}<a href={`mailto:${FLOCK_CONTACT_EMAIL}`} style={{ color: K.moss }}>{FLOCK_CONTACT_EMAIL}</a>{q.after}
        </p>
      </Footer>
    </div>
  );
}

/** The walk-through at a step. Backing out of screen 1 is the system Back
 *  (or Escape), handled by the route. */
export function GuidelinesWalkthrough({ step, onStep, onAgree, onReadFull }: {
  step: number;
  onStep: (step: number) => void;
  onAgree: () => Promise<void>;
  onReadFull: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Each screen starts at its top.
  useEffect(() => { if (typeof window !== "undefined") window.scrollTo(0, 0); }, [step]);
  const agree = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try { await onAgree(); }
    catch { setFailed(true); setSaving(false); }
  };
  return (
    <div style={{ color: K.forest, fontFamily: "'DM Sans', sans-serif" }} className="setup-frame">
      {step === 1 && <ScreenOne onNext={() => onStep(2)} />}
      {step === 2 && <ScreenTwo onNext={() => onStep(3)} onBack={() => onStep(1)} />}
      {step === 3 && <ScreenThree onBack={() => onStep(2)} onAgree={agree} onReadFull={onReadFull} saving={saving} failed={failed} />}
    </div>
  );
}
