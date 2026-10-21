// The public reading pages: Privacy policy, Terms of service and Delete your
// account. Same system as the rest of the app (components/kya.tsx): a forest
// page header with back top left and a Newsreader 30px title, a mist body with
// rounded top corners, and the text in one white card. No tab bar here, so the
// body runs to the bottom of the screen and clears the home indicator.
import type { ReactNode } from "react";
import { Link, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { K, KyaCard, SERIF } from "@/components/kya";
import { PageHeader } from "@/components/headers";

/**
 * Back to the actual previous screen (signup, settings) when there is one,
 * else "/" (which sends a signed-in owner on to Home). canGoBack alone can be
 * true while the browser tab has no prior entry — opened from an email, a deep
 * link or a fresh (PWA) load — where router.history.back() silently does
 * nothing, so a real browser history entry is required too.
 */
function useLegalBack() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  return () => {
    if (canGoBack && typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void navigate({ to: "/" });
    }
  };
}

export function LegalPage({ title, children }: { title: ReactNode; children: ReactNode }) {
  const goBack = useLegalBack();
  return (
    <div className="setup-frame min-h-screen" style={{ background: K.mist, color: K.forest }}>
      <PageHeader title={title} onBack={goBack} />
      <main
        className="relative mx-auto -mt-[26px] max-w-md rounded-t-[26px] px-4 pb-[max(env(safe-area-inset-bottom),32px)] pt-5"
        style={{ background: K.mist }}
      >
        <KyaCard className="px-5 py-6">
          <div className="space-y-4 text-[15px] leading-[1.6]" style={{ color: K.ink }}>
            {children}
          </div>
        </KyaCard>
      </main>
    </div>
  );
}

/** Section heading inside a legal card: Newsreader 700, 21px, sentence case. */
export function LegalHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-3 text-[21px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF, color: K.forest }}>
      {children}
    </h2>
  );
}

/** Moss, underlined, bold: links and the support address in legal text. */
const LINK_CLASS = "font-[700] underline underline-offset-2 [overflow-wrap:anywhere]";

/** The support address (or any outside link) inside legal text. */
export function LegalMail({ href, children }: { href: string; children?: ReactNode }) {
  return <a href={href} className={LINK_CLASS} style={{ color: K.moss }}>{children}</a>;
}

/** A link to another legal page. */
export function LegalLink({ to, children }: { to: "/privacy" | "/terms" | "/delete-account"; children?: ReactNode }) {
  return <Link to={to} className={LINK_CLASS} style={{ color: K.moss }}>{children}</Link>;
}

/** Bold forest emphasis inside legal text. */
export function LegalStrong({ children }: { children?: ReactNode }) {
  return <strong className="font-[700]" style={{ color: K.forest }}>{children}</strong>;
}

/** "Last updated" line under the text. */
export function LegalUpdated({ children }: { children: ReactNode }) {
  return <p className="text-[13px]" style={{ color: K.quiet }}>{children}</p>;
}
