import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { KyaBackRow, KyaBody, KyaHeader, KyaTitle } from "@/components/kya";

/** An inner Community screen (You, a member, a bird, the members list): the
 *  care app's forest header with Back, a title and line, then the mist body.
 *  Back goes back, or to `fallback` when this was opened directly. */
export function FlockSubPage({ title, line, fallback, right, children }: {
  title: ReactNode;
  line?: ReactNode;
  fallback: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void router.navigate({ to: fallback });
  };
  return (
    <>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={back} right={right} />
        <KyaTitle title={title} line={line} />
      </KyaHeader>
      <KyaBody>{children}</KyaBody>
    </>
  );
}
