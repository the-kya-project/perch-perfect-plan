// The front door: the logged-out landing, sign in / sign up / forgot
// password, reset password, check your email, and the invite and handoff
// accept screens. Same system as the rest of the app (components/kya.tsx):
// a forest header, a mist body with 26px rounded top corners, white cards,
// Newsreader headings, sunflower main buttons. There's no tab bar here, so
// the page fills the screen and the body runs to the bottom.
import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { K, KyaHeading, KyaIconButton } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";

/** Full-height page on forest; the mist body fills whatever the header leaves. */
export function FrontDoorPage({ children }: { children: ReactNode }) {
  return (
    <div className="setup-frame flex min-h-[100dvh] flex-col" style={{ background: K.forest, color: K.forest }}>
      {children}
    </div>
  );
}

/** Forest header: back top left (only the back), the Kya & Co. logo centered
 *  on the screen with or without a back, 44px balance on the right. */
export function FrontDoorHeader({ onBack, backLabel, title, line, children }: {
  onBack?: () => void;
  backLabel?: string;
  title?: ReactNode;
  line?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="text-white">
      <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+14px)]">
        {/* Three columns: back (or an empty 44px slot) | logo | 44px balance.
            The logo always sits in the middle column, centered on the screen,
            whether or not there's a back button; it never shares a side with Back. */}
        <div className="grid min-h-[44px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3">
          {onBack
            ? <KyaIconButton label={backLabel ?? t("frontDoor.back", "Back")} onClick={onBack}><ArrowLeft className="size-5" /></KyaIconButton>
            : <span className="size-11" aria-hidden="true" />}
          <div className="flex min-w-0 justify-center">
            <BrandLockup orientation="horizontal" variant="ink" size={118} />
          </div>
          <span className="size-11" aria-hidden="true" />
        </div>
        {title && <KyaHeading as="h1" size={30} className="mt-7 text-white">{title}</KyaHeading>}
        {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
        {children}
      </div>
    </header>
  );
}

/** The mist body under the header, 26px rounded top corners, to the bottom of the screen. */
export function FrontDoorBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className="relative -mt-[26px] flex-1 rounded-t-[26px]" style={{ background: K.mist }}>
      <div className={`mx-auto flex max-w-md flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),28px)] pt-6 ${className}`}>{children}</div>
    </main>
  );
}

/** An error the person must see: a red-bordered white card, never a toast alone. */
export function FrontDoorError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[13.5px] font-[500] leading-[1.45]" style={{ borderColor: K.red, color: K.red }}>
      {children}
    </div>
  );
}

/** A white card of lines, each led by a round forest check. */
export function CheckListCard({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 rounded-[20px] bg-white p-4">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.45]" style={{ color: K.ink }}>
          <span className="mt-[1px] grid size-6 shrink-0 place-items-center rounded-full" style={{ background: K.forest, color: K.lime }} aria-hidden="true">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Secondary action on forest: transparent, 2px lime border, white text. */
export function OnForestOutlineButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 bg-transparent px-6 text-[16px] font-[700] text-white active:scale-[0.99]"
      style={{ borderColor: K.lime }}
    >
      {children}
    </button>
  );
}

/** "Privacy · Terms · Delete account", muted, for the bottom of the auth screens. */
export function LegalLinks() {
  const { t } = useTranslation();
  const link = "inline-flex min-h-[44px] items-center px-1 underline-offset-2 hover:underline";
  return (
    <p className="m-0 flex flex-wrap items-center justify-center text-[12.5px]" style={{ color: K.quiet }}>
      <a href="/privacy" className={link}>{t("frontDoor.privacy", "Privacy")}</a>
      <span aria-hidden="true">·</span>
      <a href="/terms" className={link}>{t("frontDoor.terms", "Terms")}</a>
      <span aria-hidden="true">·</span>
      <a href="/delete-account" className={link}>{t("frontDoor.deleteAccount", "Delete account")}</a>
    </p>
  );
}

/** "Already have an account? Sign in", for the invite and handoff create-account
 *  forms: signs in on /auth and comes straight back to `returnTo`. */
export function SignInInstead({ returnTo }: { returnTo: string }) {
  return (
    <p className="m-0 text-center text-[14.5px]" style={{ color: K.quiet }}>
      <Trans
        i18nKey="frontDoor.haveAccountSignIn"
        defaults="Already have an account? <go>Sign in</go>"
        components={{ go: <Link to="/auth" search={{ mode: "signin", redirect: returnTo }} className="inline-flex min-h-[44px] items-center font-[700]" style={{ color: K.moss }} /> }}
      />
    </p>
  );
}
