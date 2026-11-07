import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";

// Privacy: exactly what other members see, and what they never see. Keep this
// in step with the flock_* functions in 20261107180000_flock_profiles.sql.
export const Route = createFileRoute("/_authenticated/flock/you/privacy")({
  component: FlockPrivacy,
});

function List({ items, yes }: { items: string[]; yes: boolean }) {
  const Icon = yes ? Check : X;
  return (
    <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15px] leading-[1.45]" style={{ color: K.ink }}>
          <Icon className="mt-0.5 size-[18px] shrink-0" style={{ color: yes ? K.moss : K.red }} aria-hidden="true" />
          {i}
        </li>
      ))}
    </ul>
  );
}

function FlockPrivacy() {
  const { t } = useTranslation();
  return (
    <FlockSubPage title={t("flock.you.privacy", "Privacy")} line={t("flock.privacy.line", "What other members can see, and what they never see.")} fallback="/flock/you">
      <KyaCard className="p-5" >
        <KyaHeading size={20}>{t("flock.privacy.seeTitle", "Members can see")}</KyaHeading>
        <div data-testid="privacy-see">
          <List yes items={[
            t("flock.privacy.see.name", "Your display name"),
            t("flock.privacy.see.region", "Your region (your chapter)"),
            t("flock.privacy.see.bio", "Your bio"),
            t("flock.privacy.see.photo", "Your profile photo"),
            t("flock.privacy.see.birds", "The birds you choose to show: their name, species, and photo"),
          ]} />
        </div>
      </KyaCard>
      <KyaCard className="p-5">
        <KyaHeading size={20}>{t("flock.privacy.neverTitle", "Members never see")}</KyaHeading>
        <div data-testid="privacy-never">
          <List yes={false} items={[
            t("flock.privacy.never.email", "Your email"),
            t("flock.privacy.never.address", "Your address"),
            t("flock.privacy.never.care", "Your birds' care records and care plans"),
            t("flock.privacy.never.sits", "Your sits and sitters"),
            t("flock.privacy.never.health", "Health checks and health notes"),
            t("flock.privacy.never.weights", "Weights"),
          ]} />
        </div>
      </KyaCard>
      <Link to="/flock/you/edit" hash="birds" className="inline-flex min-h-[44px] items-center px-1 text-[15px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
        {t("flock.privacy.manage", "Choose which birds members meet")}
      </Link>
    </FlockSubPage>
  );
}
