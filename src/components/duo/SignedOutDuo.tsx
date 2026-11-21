// The signed-out screens on the iPhone Duo (two panes, lib/duo.ts): landing,
// sign in / sign up / reset password, gift and redeem. There are no tabs here,
// so the side column is only the status bar's strip, on dark forest. The
// forms put the Sun Conure photo in the left half and the form, on white, in
// the right half. Every other screen size keeps the regular front door.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/BrandLogo";
import { useDuoLayout } from "@/lib/duo";

export const HERO_SRC = "/brand/email/app-launch-hero.jpg";

/** True inside DuoFrontDoor's right half: FrontDoorHeader / FrontDoorBody
 *  draw on white there, with no logo (the left half carries it). */
export const InDuoFrontDoor = createContext(false);
export const useInDuoFrontDoor = () => useContext(InDuoFrontDoor);

/** html.duo while a signed-out Duo screen is up (the authenticated layout does
 *  the same for signed-in screens), and the column with no tabs. */
export function SignedOutDuoChrome() {
  const { rail, split } = useDuoLayout();
  useEffect(() => {
    if (!rail) return;
    const html = document.documentElement;
    html.classList.add("duo");
    html.classList.toggle("duo-two-pane", split);
    html.setAttribute("data-duo-rail", rail);
    return () => {
      html.classList.remove("duo", "duo-two-pane");
      html.removeAttribute("data-duo-rail");
    };
  }, [rail, split]);
  return rail ? <div className="duo-rail duo-rail-signed-out" aria-hidden="true" /> : null;
}

/** Sign in, sign up, reset password, gift, redeem: the photo in the left half,
 *  the form on white in the right half. */
export function DuoFrontDoor({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="duo-content">
      <div className="duo-split duo-front-door setup-frame">
        <div className="duo-pane relative overflow-hidden" data-duo-pane="left" style={{ background: "#12291f" }}>
          {/* The conure's head sits right of center in the 1040x640 frame:
              this keeps its face and eye clear of the line at the bottom. */}
          <img src={HERO_SRC} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "66% 26%" }} />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(18,41,31,0) 55%, rgba(18,41,31,0.78) 84%, #12291f 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 px-7 pb-[calc(env(safe-area-inset-bottom)+28px)] text-white">
            <BrandLockup orientation="horizontal" variant="white" size={132} />
            <p className="m-0 mt-2 text-[17px] leading-[1.4]" style={{ color: "#d6e8dc" }}>{t("duoFrontDoor.tagline", "Calm, clear care for your bird.")}</p>
          </div>
        </div>
        <div className="duo-pane flex flex-col bg-white" data-duo-pane="right">
          <InDuoFrontDoor.Provider value={true}>{children}</InDuoFrontDoor.Provider>
        </div>
      </div>
      <SignedOutDuoChrome />
    </div>
  );
}
