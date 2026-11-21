// Mark as passed on the iPhone Duo (two panes). The route keeps both states
// and the confirm; this lays them out.
//   ask      → the bird's photo on the left, the gentle question on the right
//              with the one main button (Yes, … has passed) and Not now.
//   guidance → shown once, right after confirming: the four topics on the
//              dark left pane, the chosen one on the right, Done at its bottom.
// The guidance copy is PassingGuidance's, word for word (COPY-EXACT).
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, ClipboardList, Flower2, Loader2, Stethoscope } from "lucide-react";
import { K, KyaLink } from "@/components/kya";
import { RailBack } from "@/components/DuoRail";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, StepList } from "@/components/duo/DuoBlocks";
import { FlowBirdPhoto, FlowHeading } from "@/components/duo/flows/FlowParts";
import { PathDetail, pathTitle, type PassingPath, type VetContact } from "@/components/PassingGuidance";

type Topic = "necropsy-question" | PassingPath;

export function FarewellDuo({ step, name, photo, photoPosition, ownerName, vet, busy, canConfirm, onConfirm, onNotNow, onDone, onBack }: {
  step: "ask" | "guidance";
  name: string;
  photo?: { url: string; original?: string | null } | null;
  photoPosition?: string | null;
  ownerName: string;
  vet: VetContact;
  busy: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
  onNotNow: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState<Topic>("necropsy-question");

  if (step === "ask") {
    const title = t("farewell.askHeadline", "Has {{name}} passed away?", { name });
    return (
      <DuoTwoPane
        leftLabel={name}
        rightLabel={title}
        left={
          <>
            <RailBack onBack={onBack} />
            <FlowBirdPhoto url={photo?.url} original={photo?.original} position={photoPosition} name={name} height={300} rounded={28} />
            <h1 className="m-0 mt-5 text-[30px] font-[600] leading-tight" style={{ fontFamily: "'Newsreader', Georgia, serif", color: DUO.forest }}>{name}</h1>
          </>
        }
        right={
          <PopOutCard
            eyebrow={t("farewell.askEyebrow", "Take your time")}
            title={title}
            action={
              <DuoMainButton disabled={busy || !canConfirm} onClick={onConfirm}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("farewell.confirm", "Yes, {{name}} has passed", { name })}
              </DuoMainButton>
            }
            footer={<KyaLink onClick={onNotNow}>{t("farewell.notNow", "Not now")}</KyaLink>}
          >
            <p className="m-0 text-[16px] leading-[1.6]" style={{ color: K.ink }}>
              {t("farewell.askBody", "We're so sorry. This gently pauses {{name}}'s daily reminders, and if a sit is active, lets their sitter know they can stop too. {{name}}'s record, journal, and moments are kept, so you can look back whenever you'd like.", { name })}
            </p>
          </PopOutCard>
        }
      />
    );
  }

  // Same keys and wording as the phone's GuidancePaths.
  const topics: { key: Topic; title: string; icon: ReactNode }[] = [
    { key: "necropsy-question", title: t("farewell.necropsyTitle", "Should you consider a necropsy?"), icon: <CircleHelp /> },
    { key: "necropsy", title: t("passingGuidance.pathChoice.necropsy", "Keep {{name}} for a necropsy", { name }), icon: <ClipboardList /> },
    { key: "burial", title: t("passingGuidance.pathChoice.burial", "Prepare {{name}} for burial or cremation", { name }), icon: <Flower2 /> },
    { key: "vet", title: t("passingGuidance.pathChoice.vet", "Bring {{name}} to the vet", { name }), icon: <Stethoscope /> },
  ];
  const title = t("farewell.guidanceTitle", "A few things that can help");

  return (
    <DuoTwoPane
      dark
      leftLabel={title}
      rightLabel={topics.find((x) => x.key === topic)?.title}
      left={
        <>
          <RailBack onBack={onBack} />
          <FlowHeading dark eyebrow={t("farewell.guidanceEyebrow", "In your own time")} title={title} />
          <div className="mt-6">
            <StepList label={title} steps={topics} current={topic} onSelect={(k) => setTopic(k as Topic)} />
          </div>
          <p className="m-0 mt-5 text-[14px] leading-[1.5]" style={{ color: "rgba(255,255,255,0.72)" }}>
            {t("farewell.disclaimer", "Gentle starting points, not medical advice. Your avian vet can guide the specifics.")}
          </p>
        </>
      }
      right={
        <PopOutCard
          eyebrow={name}
          title={topic === "necropsy-question" ? t("farewell.necropsyTitle", "Should you consider a necropsy?") : pathTitle(t, topic, name)}
          action={<DuoMainButton onClick={onDone}>{t("farewell.done", "Done")}</DuoMainButton>}
        >
          {topic === "necropsy-question" ? (
            <p className="m-0 text-[16px] leading-[1.6]" style={{ color: K.ink }}>
              {t("farewell.necropsyBody", "If {{name}}'s passing was sudden or unexplained, or you have other birds, a necropsy can tell you why, and whether your flock is at risk. It's time sensitive, so it helps to decide soon.", { name })}
            </p>
          ) : (
            <PathDetail key={topic} path={topic} name={name} ownerName={ownerName} vet={vet} audience="owner" look="kya" hideTitle />
          )}
        </PopOutCard>
      }
    />
  );
}
