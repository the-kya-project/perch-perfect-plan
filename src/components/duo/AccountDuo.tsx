// Account settings on the iPhone Duo (two panes, lib/duo.ts): the account's
// tiles on the left, the chosen one's settings in a pop-out card on the right,
// editable in place. Shared by /account (Emergency info, or Household with
// ?tile=household), /account/emergency, /account/security and /scans/settings,
// so picking a tile swaps the right half and never drops to a phone page.
// Each route passes its own page as `children`; it renders inside the card with
// its shell and header dropped (KyaInCard). Every other screen size keeps the
// regular pages exactly as they were.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Bell, Lock, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { RailBack } from "@/components/DuoRail";
import { K, KyaInCard, KyaLink, KyaSecondaryButton } from "@/components/kya";
import { fieldLabel, missingRequired, type EmergencyValues } from "@/components/EmergencyContacts";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, Tile, TileGrid, type TileTone } from "@/components/duo/DuoBlocks";
import { useOwnerEmergency } from "@/lib/useOwnerEmergency";
import { formatPhoneOnBlur, isPhoneField, phoneWarning, type EmergencyField } from "@/lib/emergency";
import { getHouseholdAccount } from "@/lib/household.functions";
import { memberDisplayName } from "@/lib/memberDisplay";
import { friendlyError } from "@/lib/errorMessage";

/** "more" is no tile: the full account list (language, time zone, sign out…)
 *  shown in the card from the link under the tiles. */
export type AccountTile = "emergency" | "household" | "notifications" | "password" | "more";

/** "Sam", "Sam and Alex", "Sam, Alex and Jo". */
function joinAnd(t: TFunction, items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return t("account.joinAnd", "{{list}} and {{last}}", { list: items.slice(0, -1).join(", "), last: items[items.length - 1] });
}

/** What the tiles say. Same queries (and cache keys) as the Account page. */
function useAccountSummary() {
  const { t } = useTranslation();
  const [me, setMe] = useState<{ id: string; email: string; name: string; hasPassword: boolean } | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await getLocalUser();
      const user = u.user;
      if (!user) return;
      const fromMeta = ((user.app_metadata as { providers?: string[] } | undefined)?.providers ?? []) as string[];
      const fromIds = (user.identities ?? []).map((i) => i.provider);
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      setMe({ id: user.id, email: user.email ?? "", name: (p?.display_name ?? "").trim(), hasPassword: [...fromMeta, ...fromIds].includes("email") });
    })();
  }, []);
  const { data: emergency } = useOwnerEmergency();
  const getHousehold = useServerFn(getHouseholdAccount);
  const { data: household } = useQuery({ queryKey: ["household-account"], queryFn: () => getHousehold() });
  const { data: notif } = useQuery({
    queryKey: ["account-notif-status"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const [{ data: p }, { count }] = await Promise.all([
        (supabase as any).from("profiles").select("notify_sitter_log, notify_care_plan_reminder, notify_monthly_letter, notify_onboarding").eq("id", u.user.id).maybeSingle(),
        supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", u.user.id),
      ]);
      const emailOn = !!p && Object.values(p as Record<string, unknown>).some(Boolean);
      return { emailOn, pushOn: (count ?? 0) > 0 };
    },
  });

  const gaps = emergency === undefined ? null : missingRequired((emergency ?? {}) as EmergencyValues);
  const members = (household?.members ?? []) as { user_id?: string; name: string | null; email: string | null }[];
  const firstNames = members.map((m) => (m.name?.trim() || m.email?.split("@")[0] || "").split(/\s+/)[0]).filter(Boolean);
  const householdLine = !household
    ? undefined
    : firstNames.length === 0
      ? t("account.householdJustYou", "Just you")
      : firstNames.length > 3
        ? t("account.householdYouAndOthers", "You and {{count}} others", { count: firstNames.length })
        : t("account.householdYouAnd", "You and {{names}}", { names: joinAnd(t, firstNames) });

  return { me, emergency: (emergency ?? {}) as EmergencyValues, emergencyLoaded: emergency !== undefined, gaps, members, householdLine, notif };
}

/** The account's two-pane screen. `selected` is the tile whose settings are
 *  in the card; `children` is that tile's page (null = the built-in panel). */
export function AccountDuo({ selected, children }: { selected: AccountTile; children?: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const s = useAccountSummary();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  // Picking a tile swaps the right half; replace, so Back still leaves the account.
  const open = (tile: AccountTile) => {
    if (tile === selected) return;
    if (tile === "emergency") void navigate({ to: "/account", replace: true });
    else if (tile === "household") void navigate({ to: "/account", search: { tile: "household" }, replace: true });
    else if (tile === "notifications") void navigate({ to: "/scans/settings", replace: true });
    else void navigate({ to: "/account/security", replace: true });
  };

  const emergencyStatus: { text: string; tone: TileTone } | undefined = s.gaps === null
    ? undefined
    : s.gaps.length === 2
      ? { text: t("account.needsTwoNumbers", "Needs 2 numbers"), tone: "attention" }
      : s.gaps.length === 1
        ? { text: s.gaps[0] === "owner_phone" ? t("account.needsYourPhone", "Needs your phone") : t("account.needsVetPhone", "Needs vet phone"), tone: "attention" }
        : { text: t("accountDuo.complete", "Complete"), tone: "fine" };

  const initial = ((s.me?.name || s.me?.email || "?").trim()[0] ?? "?").toUpperCase();

  const titles: Record<AccountTile, string> = {
    emergency: t("account.emergencyInfo", "Emergency info"),
    household: t("account.household", "Household"),
    notifications: t("account.notifications", "Notifications"),
    password: t("accountDuo.password", "Password"),
    more: t("accountDuo.moreTitle", "More settings"),
  };

  const left = (
    <>
      <RailBack onBack={goBack} />
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full text-[24px] font-[700]" style={{ background: K.forest, color: K.lime }}>{initial}</span>
        <div className="min-w-0">
          <h1 className="m-0 text-[28px] font-[600] leading-tight" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{t("account.yourAccount", "Your account")}</h1>
          {s.me && <p className="m-0 truncate text-[15px] font-[700]">{s.me.name || t("account.yourName", "Your name")}</p>}
          {s.me && <p className="m-0 truncate text-[14px]" style={{ color: DUO.quiet }}>{s.me.email}</p>}
        </div>
      </div>
      <div className="mt-6">
        <TileGrid label={t("account.yourAccount", "Your account")}>
          <Tile icon={<ShieldAlert />} title={titles.emergency} status={emergencyStatus?.text} tone={emergencyStatus?.tone} selected={selected === "emergency"} onSelect={() => open("emergency")} />
          <Tile icon={<Users />} title={titles.household} status={s.householdLine} tone="fine" selected={selected === "household"} onSelect={() => open("household")} />
          <Tile icon={<Bell />} title={titles.notifications} status={s.notif ? (s.notif.emailOn ? t("account.emailOn", "Email on") : t("account.emailOff", "Email off")) : undefined} tone={s.notif?.emailOn ? "fine" : "neutral"} selected={selected === "notifications"} onSelect={() => open("notifications")} />
          <Tile icon={<Lock />} title={titles.password} status={s.me ? (s.me.hasPassword ? t("accountDuo.passwordSet", "Set") : t("accountDuo.passwordNotSet", "Not set")) : undefined} tone={s.me?.hasPassword ? "fine" : "neutral"} selected={selected === "password"} onSelect={() => open("password")} />
        </TileGrid>
      </div>
      <div className="mt-auto flex flex-wrap gap-x-5 pt-6">
        <KyaLink onClick={() => navigate({ to: "/account", search: { tile: "more" }, replace: true })}>{t("accountDuo.moreSettings", "Language, time zone and more")}</KyaLink>
        <KyaLink color={K.red} onClick={() => navigate({ to: "/account", search: { tile: "more", delete: true }, replace: true })}>{t("account.deleteAccount", "Delete account")}</KyaLink>
      </div>
    </>
  );

  const eyebrow = t("account.yourAccount", "Your account");
  const right = selected === "emergency" && !children ? (
    <EmergencyQuickForm values={s.emergency} loaded={s.emergencyLoaded} eyebrow={eyebrow} title={titles.emergency} />
  ) : selected === "household" && !children ? (
    <PopOutCard
      eyebrow={eyebrow}
      title={titles.household}
      action={<KyaSecondaryButton className="w-full" onClick={() => navigate({ to: "/household" })}>{t("accountDuo.manageHousehold", "Manage household")}</KyaSecondaryButton>}
    >
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("accountDuo.householdLine", "People who help care for your birds all the time.")}</p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
        {s.members.map((m, i) => (
          <li key={m.user_id ?? i} className="flex items-center gap-3 rounded-[18px] px-3 py-2.5" style={{ background: DUO.bg }}>
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full text-[16px] font-[700]" style={{ background: K.forest, color: K.lime }}>{(memberDisplayName(m as any) || "?").slice(0, 1).toUpperCase()}</span>
            <span className="text-[16px] font-[700]">{memberDisplayName(m as any)}</span>
          </li>
        ))}
        {s.members.length === 0 && <li className="text-[15px]" style={{ color: DUO.quiet }}>{t("account.householdJustYou", "Just you")}</li>}
      </ul>
    </PopOutCard>
  ) : (
    <PopOutCard eyebrow={eyebrow} title={titles[selected]}>
      <KyaInCard.Provider value={true}>{children}</KyaInCard.Provider>
    </PopOutCard>
  );

  return <DuoTwoPane left={left} right={right} leftLabel={eyebrow} rightLabel={titles[selected]} />;
}

// The fields the card edits in place: your phone, the regular (avian) vet, the
// after-hours vet and where the carrier is. The rest stay on the full list.
const QUICK_FIELDS: { group: "you" | "vet" | "emergency" | "carrier"; fields: EmergencyField[] }[] = [
  { group: "you", fields: ["owner_phone"] },
  { group: "vet", fields: ["avian_vet_name", "avian_vet_phone"] },
  { group: "emergency", fields: ["emergency_vet_name", "emergency_vet_phone"] },
  { group: "carrier", fields: ["carrier_location"] },
];

/** Emergency info edited in place, saved for every bird (owner_emergency_defaults).
 *  Empty phone fields carry an amber border. */
function EmergencyQuickForm({ values, loaded, eyebrow, title }: { values: EmergencyValues; loaded: boolean; eyebrow: string; title: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const all = QUICK_FIELDS.flatMap((g) => g.fields);
  const fromValues = () => Object.fromEntries(all.map((f) => [f, (values[f] ?? "").toString()])) as Record<EmergencyField, string>;
  const [form, setForm] = useState<Record<EmergencyField, string>>(fromValues);
  const [saving, setSaving] = useState(false);
  // Fill the fields once the saved values arrive (not on every refetch).
  const seeded = useRef(false);
  useEffect(() => {
    if (!loaded || seeded.current) return;
    seeded.current = true;
    setForm(fromValues());
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = all.some((f) => (form[f] ?? "").trim() !== (values[f] ?? "").toString().trim());
  const groupLabel: Record<string, string> = {
    you: t("emergencyList.you", "You"),
    vet: t("accountDuo.regularVet", "Regular vet"),
    emergency: t("emergencyList.emergencyVet", "After-hours emergency vet"),
    carrier: t("emergencyList.carrier", "Carrier"),
  };

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      if (!u.user) throw new Error(t("accountEmergency.signedOut", "Signed out."));
      const patch = Object.fromEntries(all.map((f) => [f, form[f].trim() || null]));
      const { data, error } = await supabase.from("owner_emergency_defaults").upsert({ owner_id: u.user.id, ...patch } as any, { onConflict: "owner_id" }).select("owner_id");
      if (error) throw error;
      // RLS can refuse an upsert without an error: require the row back.
      if (!data?.length) throw new Error(t("accountDuo.notSaved", "That didn't save. Try again."));
      seeded.current = false;
      await qc.invalidateQueries({ queryKey: ["owner-defaults"] });
      qc.invalidateQueries({ queryKey: ["care-plan-status"] });
      toast.success(t("accountEmergency.saved", "Saved for all your birds."));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PopOutCard
      eyebrow={eyebrow}
      title={title}
      action={<DuoMainButton onClick={() => void save()} disabled={saving || !dirty || !loaded}>{saving ? t("account.saving", "Saving…") : t("account.saveChanges", "Save changes")}</DuoMainButton>}
      footer={<KyaLink onClick={() => navigate({ to: "/account/emergency", search: { all: true } })}>{t("accountDuo.allEmergency", "Backup contact, first-aid kit and more")}</KyaLink>}
    >
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("accountDuo.emergencyLine", "What a sitter sees if something goes wrong. Saved for all your birds.")}</p>
      <div className="mt-4 flex flex-col gap-5">
        {QUICK_FIELDS.map((g) => (
          <fieldset key={g.group} className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{groupLabel[g.group]}</legend>
            {g.fields.map((f) => {
              const phone = isPhoneField(f);
              const empty = !form[f]?.trim();
              const warn = phone ? phoneWarning(form[f]) : null;
              return (
                <label key={f} className="flex flex-col gap-1.5">
                  <span className="text-[14px] font-[700]">{fieldLabel(t, f)}</span>
                  <input
                    value={form[f] ?? ""}
                    inputMode={phone ? "tel" : undefined}
                    type={phone ? "tel" : "text"}
                    data-empty-phone={phone && empty ? "" : undefined}
                    onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
                    onBlur={phone ? () => setForm((p) => ({ ...p, [f]: formatPhoneOnBlur(p[f]) })) : undefined}
                    className="min-h-[52px] w-full rounded-[16px] border-2 bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f]"
                    style={{ borderColor: phone && empty ? "#e0b860" : DUO.line, color: DUO.forest, background: phone && empty ? DUO.attentionBg : "#fff" }}
                  />
                  {warn && <span className="text-[13px]" style={{ color: DUO.attentionText }}>{warn}</span>}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </PopOutCard>
  );
}
