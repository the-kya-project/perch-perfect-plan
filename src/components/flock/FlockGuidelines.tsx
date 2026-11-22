import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { contactLine, FLOCK_CONTACT_EMAIL, guidelineSections, guidelinesClosing, guidelinesIntro } from "@/lib/flockGuidelines";

/** The community guidelines, word for word: the same text on the join step
 *  and the Community guidelines page. */
export function FlockGuidelinesText({ withContact = true }: { withContact?: boolean }) {
  const { t } = useTranslation();
  const intro = guidelinesIntro(t);
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="flock-guidelines">
      <h3 className="m-0 text-[17px] font-[700]" style={{ color: K.forest }}>{intro.title}</h3>
      <p className="m-0">{intro.body}</p>
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
        {guidelineSections(t).map((s) => (
          <li key={s.key} data-guideline={s.key}><strong style={{ color: K.forest }}>{s.title}</strong> {s.body}</li>
        ))}
      </ul>
      <p className="m-0">{guidelinesClosing(t)}</p>
      {withContact && <FlockContactLine />}
    </div>
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
