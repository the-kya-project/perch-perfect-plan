import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, Cross, Home as HomeIcon, Ban, PawPrint, SprayCan } from "lucide-react";
import { K, KyaBody, KyaCard, KyaIconTile } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { aroundHouseItems, useSitterShell, VetNote } from "@/components/sitter/sitterShared";
import { useSitterContext } from "./route";
import { useDuoMode } from "@/lib/duo";
import { RailBack } from "@/components/DuoRail";
import { DuoSectionReader } from "@/components/duo/DuoSectionReader";
import { SitterDuoTopBar } from "@/components/duo/sitter/SitterDuoRail";

// "Around the house" — opened from Home (or Today on one-bird sits): where the
// carrier and first-aid kit are (from the merged emergency info), and the
// household details the sitter can already see (cleaning products, off-limits
// areas, other pets — the plan merged with the owner's "Your home").
export const Route = createFileRoute("/sitter/$token/around")({
  component: AroundTheHouse,
});

const ICONS: Record<string, typeof HomeIcon> = {
  carrier: Briefcase,
  firstAid: Cross,
  cleaning: SprayCan,
  offLimits: Ban,
  otherPets: PawPrint,
};

function AroundTheHouse() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { multi } = useSitterShell();
  const { data: ctx } = useSitterContext(token);
  const items = aroundHouseItems(ctx, t);
  const goBack = useGoBack(useCallback(() => {
    if (multi) navigate({ to: "/sitter/$token/home", params: { token } });
    else navigate({ to: "/sitter/$token", params: { token } });
  }, [multi, navigate, token]));
  const duo = useDuoMode() === "sideways";
  const [open, setOpen] = useState<string>(items[0]?.key ?? "empty");

  // iPhone Duo: each thing as a big card on the left, the open one on the right.
  if (duo) {
    const sections = items.length === 0
      ? [{
          key: "empty",
          title: t("sitter.around.title", "Around the house"),
          icon: <HomeIcon />,
          body: <p className="m-0 text-[17px] leading-[1.5]" style={{ color: K.quiet }}>{t("sitter.around.empty", "Nothing has been added about the house yet.")}</p>,
        }]
      : items.map((it) => {
          const Icon = ICONS[it.key] ?? HomeIcon;
          return {
            key: it.key,
            title: it.label,
            icon: <Icon />,
            preview: it.value,
            body: <p className="m-0 whitespace-pre-line text-[19px] font-[700] leading-[1.45]" style={{ color: K.forest }}>{it.value}</p>,
          };
        });
    return (
      <>
        <RailBack onBack={goBack} />
        <DuoSectionReader
          top={<div className="mb-6"><SitterDuoTopBar token={token} light /></div>}
          title={t("sitter.around.title", "Around the house")}
          line={t("sitter.around.line", "Where things are, and what to know about the home")}
          sections={sections}
          selected={open}
          onSelect={setOpen}
          leftExtra={<VetNote />}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("sitter.around.title", "Around the house")}
        line={t("sitter.around.line", "Where things are, and what to know about the home")}
        onBack={goBack}
      />
      <KyaBody>
        {items.length === 0 ? (
          <KyaCard className="p-4">
            <p className="m-0 text-[15px]" style={{ color: K.quiet }}>
              {t("sitter.around.empty", "Nothing has been added about the house yet.")}
            </p>
          </KyaCard>
        ) : (
          <KyaCard>
            {items.map((it, i) => {
              const Icon = ICONS[it.key] ?? HomeIcon;
              return (
                <div
                  key={it.key}
                  className="flex items-start gap-3 px-4 py-3.5"
                  style={{ borderBottom: i === items.length - 1 ? undefined : `1px solid ${K.line}` }}
                >
                  <KyaIconTile size={40}><Icon className="size-[18px]" /></KyaIconTile>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[13px]" style={{ color: K.quiet }}>{it.label}</p>
                    <p className="m-0 mt-0.5 whitespace-pre-line text-[15px] font-[700] leading-[1.4]" style={{ color: K.forest }}>{it.value}</p>
                  </div>
                </div>
              );
            })}
          </KyaCard>
        )}
        <VetNote />
      </KyaBody>
    </>
  );
}
