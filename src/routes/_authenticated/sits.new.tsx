import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { TaskHeader } from "@/components/headers";
import { LoadError } from "@/components/LoadError";
import { useTooLong } from "@/lib/useTooLong";
import { SitForm } from "@/components/SitForm";
import { useOwnedBirds, useRefreshSits } from "@/lib/useOwnedBirds";

// "Set up a sit" — its own full screen. ?bird= preselects a bird (from a bird's
// setup or care plan).
export const Route = createFileRoute("/_authenticated/sits/new")({
  head: () => ({ meta: [{ title: i18next.t("sitForm.metaTitleNew", "Set up a sit — Kya & Co.") }] }),
  validateSearch: z.object({ bird: z.string().uuid().optional() }),
  component: NewSit,
});

/** The sit form's chrome (same frame, header and white sheet as SitForm) while
 *  the birds load, so there's a working Close instead of a blank screen. */
export function SitFormLoading({ editing, onClose, failed, onRetry }: {
  editing?: boolean;
  onClose: () => void;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="setup-frame min-h-screen" style={{ background: K.mist, color: K.forest }}>
      <div className="mx-auto max-w-md">
        <TaskHeader
          onClose={onClose}
          title={editing ? t("sitForm.editSit", "Edit sit") : t("sitForm.setUpASit", "Set up a sit")}
          line={t("sitForm.screenIntro", "Your sitter gets the daily routine, a daily health check, and one-tap emergency contacts.")}
        />
        <main className="relative -mt-[26px] rounded-t-[26px] bg-white px-5 pb-8 pt-6">
          {failed ? (
            <LoadError onRetry={onRetry} onBack={onClose} />
          ) : (
            <div role="status" className="flex flex-col gap-4">
              <span className="sr-only">{t("sitForm.loading", "Loading…")}</span>
              <div className="h-24 animate-pulse rounded-[18px] bg-[#e3ebe2]" aria-hidden="true" />
              <div className="h-40 animate-pulse rounded-[18px] bg-[#e3ebe2]" aria-hidden="true" />
              <div className="h-24 animate-pulse rounded-[18px] bg-[#e3ebe2]" aria-hidden="true" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function NewSit() {
  const { bird } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { owned, loading, failed } = useOwnedBirds();
  const refresh = useRefreshSits();
  const close = () => navigate({ to: "/sits" });
  // Never "Loading…" forever: after 10 s, offer a retry (emergency.tsx pattern).
  const { tooLong, restart } = useTooLong(loading && !failed);
  const retry = () => { restart(); void qc.refetchQueries({ type: "active" }); };
  if (loading || failed) return <SitFormLoading onClose={close} failed={failed || tooLong} onRetry={retry} />;
  return <SitForm birds={owned} preselectBirdId={bird} onSaved={refresh} onClose={close} />;
}
