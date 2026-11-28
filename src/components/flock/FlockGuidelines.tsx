import { useTranslation } from "react-i18next";
import { K, SERIF } from "@/components/kya";
import { contactLine, FLOCK_CONTACT_EMAIL } from "@/lib/flockGuidelines";
import { fullGuidelines, questionsLine, type GuidelineBlock } from "@/flock/guidelines/content";

/** The community guidelines in full (src/flock/guidelines/content.ts): the
 *  Community guidelines page and the box on the join step. Newsreader section
 *  headings, 16px body, and the "Questions? Write to …" line at the end. */
export function FlockGuidelinesText({ withContact = true }: { withContact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-7 text-[16px] leading-[1.6]" style={{ color: K.ink }} data-testid="flock-guidelines">
      {fullGuidelines(t).map((section) => (
        <section key={section.key} className="flex flex-col gap-3" data-guideline={section.key}>
          <h2 className="m-0 text-[22px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF, color: K.forest, letterSpacing: "-0.01em" }}>
            {section.title}
          </h2>
          {section.blocks.map((b, i) => <Block key={i} block={b} />)}
        </section>
      ))}
      {withContact && <QuestionsLine />}
    </div>
  );
}

function Block({ block }: { block: GuidelineBlock }) {
  if (block.kind === "p") return <p className="m-0">{block.text}</p>;
  if (block.kind === "lead") {
    return (
      <p className="m-0">
        <strong style={{ color: K.forest }}>{block.lead}</strong>
        {block.text ? <>{" "}{block.text}</> : null}
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
      {block.items.map((item, i) => <li key={i}>{withMailLink(item)}</li>)}
    </ul>
  );
}

/** Turns the contact address inside a line into a mail link. */
function withMailLink(text: string) {
  const i = text.indexOf(FLOCK_CONTACT_EMAIL);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <a href={`mailto:${FLOCK_CONTACT_EMAIL}`} className="font-[700] underline underline-offset-2" style={{ color: K.forest }}>{FLOCK_CONTACT_EMAIL}</a>
      {text.slice(i + FLOCK_CONTACT_EMAIL.length)}
    </>
  );
}

/** "Questions? Write to brittany@thekyaproject.com", the guidelines' footer. */
export function QuestionsLine() {
  const { t } = useTranslation();
  const q = questionsLine(t);
  return (
    <p className="m-0 border-t pt-4 text-[15px]" style={{ borderColor: K.line, color: K.quiet }} data-testid="flock-contact-line">
      {q.before}
      <a href={`mailto:${FLOCK_CONTACT_EMAIL}`} className="font-[700] underline underline-offset-2" style={{ color: K.forest }}>{FLOCK_CONTACT_EMAIL}</a>
      {q.after}
    </p>
  );
}

/** "Questions or a problem? Email the Kya team at …", with a mail link. */
export function FlockContactLine() {
  const { t } = useTranslation();
  const c = contactLine(t);
  const [before, after] = c.body.split(FLOCK_CONTACT_EMAIL);
  return (
    <p className="m-0" data-testid="flock-contact-line">
      <strong style={{ color: K.forest }}>{c.title}</strong>{" "}
      {before}
      <a href={`mailto:${FLOCK_CONTACT_EMAIL}`} className="font-[700] underline underline-offset-2" style={{ color: K.forest }}>
        {FLOCK_CONTACT_EMAIL}
      </a>
      {after}
    </p>
  );
}
