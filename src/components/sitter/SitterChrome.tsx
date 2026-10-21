// Sitter view headers. Same system as the owner app (components/headers.tsx):
//   SitterTabHeader — Home, Today, Parrots 101: logo left; EN/NL switch and
//                     Help (replays the walkthrough) right. No bell or account.
//   Pages opened from a tab use PageHeader, tasks use TaskHeader + TaskFooter,
//   both straight from components/headers.tsx.
import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeader, KyaHeading, KyaIconButton } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";
import { SitterLanguageToggle } from "@/components/SitterLanguageToggle";
import { replaySitterOnboarding } from "@/components/SitterOnboarding";

/** Tab home header, sitter version. `title` is optional so Today can put its
 *  own bird switcher and title in `children`. */
export function SitterTabHeader({ token, title, line, children, titleSize = 31 }: {
  token: string;
  title?: ReactNode;
  line?: ReactNode;
  children?: ReactNode;
  titleSize?: number;
}) {
  const { t } = useTranslation();
  return (
    <KyaHeader>
      <div className="mt-1.5 flex items-center gap-2">
        <BrandLockup orientation="horizontal" variant="ink" size={118} />
        <div className="flex-1" />
        <SitterLanguageToggle token={token} />
        <KyaIconButton label={t("sitter.header.replayWalkthrough", "Replay walkthrough")} onClick={replaySitterOnboarding}>
          <HelpCircle className="size-[18px]" />
        </KyaIconButton>
      </div>
      {title && <KyaHeading as="h1" size={titleSize} className="mt-8 text-white">{title}</KyaHeading>}
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
      {children}
    </KyaHeader>
  );
}
