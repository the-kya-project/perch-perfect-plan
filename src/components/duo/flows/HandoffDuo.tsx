// Hand off a bird on the iPhone Duo (two panes): the adopter's details on the
// left, a live preview of the handoff on the right (who it goes to, what goes
// with the bird, what stays) with the one main button, Send handoff. The route
// keeps the state, validation and the send; this only lays it out.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";
import { K, KyaField, KyaLink } from "@/components/kya";
import { RailBack } from "@/components/DuoRail";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard } from "@/components/duo/DuoBlocks";
import { FlowBirdPhoto, FlowHeading } from "@/components/duo/flows/FlowParts";

export function HandoffDuo({ name, photo, photoPosition, email, setEmail, recipientName, setRecipientName, canSend, sending, onSend, onExport, onBack }: {
  name: string;
  photo?: { url: string; original?: string | null } | null;
  photoPosition?: string | null;
  email: string;
  setEmail: (v: string) => void;
  recipientName: string;
  setRecipientName: (v: string) => void;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  onExport: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const to = recipientName.trim() || email.trim();
  const title = t("birdHandoff.title", "Hand off {{name}}", { name });

  const left = (
    <>
      <RailBack onBack={onBack} />
      <FlowHeading
        title={title}
        line={t("birdHandoff.intro", "Pass {{name}}'s record to the adopter so they have everything you've learned. The record goes with the bird; once accepted, you won't have access anymore.", { name })}
      />
      <div className="mt-6 flex flex-col gap-4 rounded-[24px] border bg-white p-5" style={{ borderColor: DUO.line }}>
        <KyaField
          id="handoff-email"
          label={t("birdHandoff.emailLabel", "Adopter's email")}
          type="email" inputMode="email" autoCapitalize="off" autoCorrect="off"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t("birdHandoff.emailPlaceholder", "adopter@example.com")}
        />
        <KyaField
          id="handoff-name"
          label={t("birdHandoff.nameLabel", "Adopter's name (optional)")}
          value={recipientName} maxLength={120} onChange={(e) => setRecipientName(e.target.value)}
          placeholder={t("birdHandoff.namePlaceholder", "e.g. Sam")}
        />
      </div>
      <div className="mt-4 rounded-[20px] p-4" style={{ background: "#fcebeb", border: `1.5px solid ${K.red}` }}>
        <p className="m-0 flex items-start gap-2 text-[15px] leading-[1.5]" style={{ color: "#791f1f" }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: K.red }} aria-hidden="true" />
          <span><span className="font-[700]">{t("birdHandoff.cantUndo", "This can't be undone.")}</span> {t("birdHandoff.cantUndoBody", "Once they accept, the record is theirs. You won't be able to view or edit it.")}</span>
        </p>
      </div>
    </>
  );

  const right = (
    <PopOutCard
      eyebrow={t("handoffDuo.eyebrow", "Handoff preview")}
      title={to ? t("handoffDuo.goingTo", "{{name}} goes to {{to}}", { name, to }) : title}
      action={
        <DuoMainButton disabled={!canSend || sending} onClick={onSend}>
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          {sending ? t("birdHandoff.sending", "Sending…") : t("birdHandoff.send", "Send handoff")}
        </DuoMainButton>
      }
      footer={<KyaLink className="text-center" onClick={onExport}>{t("birdHandoff.exportInstead", "They're not on the app — export as PDF instead")}</KyaLink>}
    >
      <FlowBirdPhoto url={photo?.url} original={photo?.original} position={photoPosition} name={name} height={180} />
      <PreviewList heading={t("birdHandoff.goesWith", "What goes with {{name}}", { name })} items={[
        t("birdHandoff.goesItem1", "Care plan, identity, weight history, journal, moments"),
        t("birdHandoff.goesItem2", "The photos in those records"),
      ]} />
      <PreviewList heading={t("birdHandoff.staysWithYou", "What stays with you")} items={[
        t("birdHandoff.staysItem1", "Your contact info — it doesn't transfer"),
        t("birdHandoff.staysItem2", "A memory entry in Past birds (name, dates, where they went)"),
      ]} />
    </PopOutCard>
  );

  return <DuoTwoPane leftLabel={title} rightLabel={t("handoffDuo.eyebrow", "Handoff preview")} left={left} right={right} />;
}

function PreviewList({ heading, items }: { heading: ReactNode; items: string[] }) {
  return (
    <section className="mt-5">
      <h3 className="m-0 text-[17px] font-[700]" style={{ color: DUO.forest }}>{heading}</h3>
      <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  );
}
