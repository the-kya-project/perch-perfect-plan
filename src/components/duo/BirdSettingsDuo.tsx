// A bird's settings on the iPhone Duo (two panes, lib/duo.ts): Identity,
// Emergency and Who can see this bird as tiles on the left, the chosen one's
// page in a pop-out card on the right. Each route passes its own page as
// `children`; it renders inside the card with its shell and header dropped
// (KyaInCard). Picking a tile replaces the route, so Back leaves for the bird.
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { IdCard, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RailBack } from "@/components/DuoRail";
import { KyaInCard } from "@/components/kya";
import { missingRequired } from "@/components/EmergencyContacts";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { DUO, DuoTwoPane, PopOutCard, Tile, TileGrid, type TileTone } from "@/components/duo/DuoBlocks";
import { useBirdRole } from "@/lib/useBirdRole";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { mergeEmergency } from "@/lib/emergency";
import { getHouseholdForBird } from "@/lib/household.functions";
import { speciesLabel } from "@/lib/speciesLabel";

export type BirdSettingsTile = "identity" | "emergency" | "access";

export function BirdSettingsDuo({ birdId, selected, onBack, children }: {
  birdId: string;
  selected: BirdSettingsTile;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOwner = useBirdRole(birdId) === "owner";
  const { data: bird } = useQuery({
    queryKey: ["bird-settings-duo", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("id, name, species, photo_url, photo_position").eq("id", birdId).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; species: string | null; photo_url: string | null; photo_position: string | null } | null;
    },
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { defaults } = useBirdOwnerEmergency(birdId);
  const getHousehold = useServerFn(getHouseholdForBird);
  const { data: household } = useQuery({
    queryKey: ["household", birdId],
    enabled: isOwner,
    queryFn: () => getHousehold({ data: { birdId } }),
  });
  // Same 800px width as the bird page, so the crop matches it.
  const photo = useBirdPhotos([bird?.photo_url], 800)(bird?.photo_url);

  const name = bird?.name ?? "";
  const gaps = contacts !== undefined && defaults !== undefined ? missingRequired(mergeEmergency(contacts, defaults)) : null;
  const emergency: { text: string; tone: TileTone } | undefined = gaps === null
    ? undefined
    : gaps.length === 0
      ? { text: t("accountDuo.complete", "Complete"), tone: "fine" }
      : gaps.length === 2
        ? { text: t("account.needsTwoNumbers", "Needs 2 numbers"), tone: "attention" }
        : { text: gaps[0] === "owner_phone" ? t("account.needsYourPhone", "Needs your phone") : t("account.needsVetPhone", "Needs vet phone"), tone: "attention" };
  const people = (household?.members ?? []).length;
  const access = household
    ? people === 0 ? t("account.householdJustYou", "Just you") : t("birdSettingsDuo.youAndCount", "You and {{count}} more", { count: people })
    : undefined;

  const titles: Record<BirdSettingsTile, string> = {
    identity: t("birdSettingsDuo.identity", "Identity"),
    emergency: t("account.emergencyInfo", "Emergency info"),
    access: t("birdSettingsDuo.access", "Who can see this bird"),
  };
  const to = { identity: "/birds/$birdId/identity", emergency: "/birds/$birdId/emergency", access: "/birds/$birdId/access" } as const;
  const open = (tile: BirdSettingsTile) => {
    if (tile !== selected) void navigate({ to: to[tile], params: { birdId }, replace: true });
  };

  const left = (
    <>
      <RailBack onBack={onBack} />
      <div className="flex items-center gap-4">
        <span className="relative block size-32 shrink-0 overflow-hidden rounded-[24px]" style={{ background: DUO.forest }}>
          {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={bird?.photo_position} alt="" eager /> : (
            <span aria-hidden="true" className="grid size-full place-items-center text-[26px] font-[700] text-white">{name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: DUO.quiet }}>{t("birdSettingsDuo.eyebrow", "Settings")}</p>
          <h1 className="m-0 truncate text-[28px] font-[600] leading-tight" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{name}</h1>
        </div>
      </div>
      <div className="mt-6">
        <TileGrid label={t("birdSettingsDuo.listLabel", "{{name}}'s settings", { name })}>
          <Tile icon={<IdCard />} title={titles.identity} status={bird ? (bird.species ? speciesLabel(t, bird.species) : t("birdSettingsDuo.noSpecies", "Add species")) : undefined} tone={bird?.species ? "fine" : "attention"} selected={selected === "identity"} onSelect={() => open("identity")} />
          <Tile icon={<ShieldAlert />} title={titles.emergency} status={emergency?.text} tone={emergency?.tone} selected={selected === "emergency"} onSelect={() => open("emergency")} />
          {isOwner && <Tile icon={<Users />} title={titles.access} status={access} tone="fine" selected={selected === "access"} onSelect={() => open("access")} />}
        </TileGrid>
      </div>
    </>
  );

  return (
    <DuoTwoPane
      leftLabel={name}
      rightLabel={titles[selected]}
      left={left}
      right={
        <PopOutCard eyebrow={name} title={titles[selected]}>
          <KyaInCard.Provider value={true}>{children}</KyaInCard.Provider>
        </PopOutCard>
      }
    />
  );
}
