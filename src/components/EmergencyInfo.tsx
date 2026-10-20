// A bird's emergency info: the account's contact list by default ("Use my
// emergency info"), or its own values ("Different for [bird]"). There is no
// stored flag: a bird uses the account value for every field it leaves empty
// (mergeEmergency), so "different" means it has at least one value of its own.
// Used by the bird's emergency page and the care plan editor's Emergency tab.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useQueryClient } from "@tanstack/react-query";
import { friendlyError } from "@/lib/errorMessage";
import { EMERGENCY_FIELDS, emergencyDifferent, mergeEmergency } from "@/lib/emergency";
import { K, KyaHeading, KyaLink, KyaSecondaryButton, KyaSheet, KyaPrimaryButton } from "@/components/kya";
import { EmergencyList, EmergencyRowSheet, ROW_FIELDS, type EmergencyValues, type RowKey } from "@/components/EmergencyContacts";

export function EmergencyInfo({ birdId, birdName, contacts, defaults, onSaved, ownerName, isOwner }: {
  birdId: string;
  birdName: string;
  contacts: any;
  defaults: any | null;
  onSaved: () => void;
  ownerName?: string;
  /** Only the owner can change the account values ("All birds"). */
  isOwner?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const custom = emergencyDifferent(contacts, defaults);
  const [mode, setMode] = useState<"mine" | "different">(custom ? "different" : "mine");
  const [editing, setEditing] = useState<RowKey | null>(null);
  const [pending, setPending] = useState<Record<string, string | null> | null>(null);
  const [confirmMine, setConfirmMine] = useState(false);
  const [saving, setSaving] = useState(false);

  const trim = (v: unknown) => (v ?? "").toString().trim();
  const effective = mergeEmergency(contacts, defaults) as EmergencyValues;
  const accountValues = (defaults ?? {}) as EmergencyValues;
  const rowIsOwn = (k: RowKey) => ROW_FIELDS[k].some((f) => trim(contacts?.[f]) !== "" && trim(contacts?.[f]) !== trim(defaults?.[f]));

  async function writeBird(patch: Record<string, string | null>) {
    // Store a value only when it differs from the account's, so the bird keeps
    // following the account for everything else.
    const row: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) row[k] = v === null || v === trim(defaults?.[k]) ? null : v;
    const { error } = await supabase.from("emergency_contacts").upsert({ bird_id: birdId, ...row } as any, { onConflict: "bird_id" });
    if (error) throw error;
  }

  async function writeAccount(patch: Record<string, string | null>) {
    const { data: u } = await getLocalUser();
    if (!u.user) throw new Error(t("birdEmergency.signedOut", "Signed out."));
    const { error } = await supabase.from("owner_emergency_defaults").upsert({ owner_id: u.user.id, ...patch } as any, { onConflict: "owner_id" });
    if (error) throw error;
    // The bird follows the new account values for these fields.
    const clear = Object.fromEntries(Object.keys(patch).map((k) => [k, null]));
    const { error: e2 } = await supabase.from("emergency_contacts").upsert({ bird_id: birdId, ...clear } as any, { onConflict: "bird_id" });
    if (e2) throw e2;
    qc.invalidateQueries({ queryKey: ["owner-defaults"] });
  }

  async function run(fn: () => Promise<void>, ok: string) {
    setSaving(true);
    try {
      await fn();
      toast.success(ok);
      setEditing(null);
      setPending(null);
      onSaved();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  function onSaveRow(patch: Record<string, string | null>) {
    if (!editing) return;
    // A row still on the account's values: ask whether the change is for this
    // bird or every bird. Already custom for this bird: it stays this bird's.
    if (isOwner && !rowIsOwn(editing)) { setPending(patch); return; }
    void run(() => writeBird(patch), t("birdEmergency.savedFor", "Saved for {{name}}.", { name: birdName }));
  }

  async function switchToMine() {
    const clear = Object.fromEntries(EMERGENCY_FIELDS.map((f) => [f, null]));
    await run(async () => {
      const { error } = await supabase.from("emergency_contacts").upsert({ bird_id: birdId, ...clear } as any, { onConflict: "bird_id" });
      if (error) throw error;
      setMode("mine");
      setConfirmMine(false);
    }, t("birdEmergency.nowUsesYours", "{{name}} uses your emergency info.", { name: birdName }));
  }

  const segment = (key: "mine" | "different", label: string) => {
    const on = mode === key;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => {
          if (key === mode) return;
          if (key === "mine" && custom) setConfirmMine(true);
          else setMode(key);
        }}
        className="min-h-[44px] flex-1 rounded-full px-3 text-[14.5px] font-[700]"
        style={on ? { background: K.forest, color: "#fff" } : { color: K.forest }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label={t("birdEmergency.whichInfo", "Which emergency info")} className="flex gap-1 rounded-full bg-white p-1">
        {segment("mine", t("birdEmergency.useMine", "Use my emergency info"))}
        {segment("different", t("birdEmergency.differentFor", "Different for {{name}}", { name: birdName }))}
      </div>

      {mode === "mine" ? (
        <>
          <EmergencyList values={accountValues} ownerName={ownerName ?? ""} editable={false} />
          {isOwner && (
            <KyaLink onClick={() => navigate({ to: "/account/emergency" })}>{t("birdEmergency.editForAll", "Edit emergency info for all birds →")}</KyaLink>
          )}
        </>
      ) : (
        <EmergencyList
          values={effective}
          ownerName={ownerName ?? ""}
          editable
          onEdit={setEditing}
          badge={(k) => rowIsOwn(k)
            ? <span className="rounded-full px-2 py-[1px] text-[11.5px] font-[700]" style={{ background: K.lime, color: K.forest }}>{t("birdEmergency.customFor", "Custom for {{name}}", { name: birdName })}</span>
            : null}
        />
      )}

      {editing && !pending && (
        <EmergencyRowSheet rowKey={editing} initial={effective} saving={saving} onSave={onSaveRow} onClose={() => setEditing(null)} />
      )}

      {pending && (
        <KyaSheet
          onClose={() => setPending(null)}
          closeLabel={t("birdEmergency.close", "Close")}
          title={<KyaHeading size={22}>{t("birdEmergency.whoQuestion", "Change this for {{name}} only, or for all your birds?", { name: birdName })}</KyaHeading>}
        >
          <div className="flex flex-col gap-2.5">
            <KyaPrimaryButton disabled={saving} onClick={() => void run(() => writeBird(pending), t("birdEmergency.savedFor", "Saved for {{name}}.", { name: birdName }))}>
              {t("birdEmergency.justBird", "Just {{name}}", { name: birdName })}
            </KyaPrimaryButton>
            <KyaSecondaryButton className="w-full" disabled={saving} onClick={() => void run(() => writeAccount(pending), t("birdEmergency.savedForAll", "Saved for all your birds."))}>
              {t("birdEmergency.allBirds", "All birds")}
            </KyaSecondaryButton>
          </div>
        </KyaSheet>
      )}

      {confirmMine && (
        <KyaSheet
          onClose={() => setConfirmMine(false)}
          closeLabel={t("birdEmergency.close", "Close")}
          title={<KyaHeading size={22}>{t("birdEmergency.confirmMineTitle", "Use your emergency info for {{name}}?", { name: birdName })}</KyaHeading>}
        >
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
            {t("birdEmergency.confirmMineBody", "The details you changed for {{name}} will be cleared.", { name: birdName })}
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            <KyaPrimaryButton disabled={saving} onClick={() => void switchToMine()}>{t("birdEmergency.confirmMine", "Use my emergency info")}</KyaPrimaryButton>
            <KyaSecondaryButton className="w-full" disabled={saving} onClick={() => setConfirmMine(false)}>{t("birdEmergency.keepCustom", "Keep {{name}}'s details", { name: birdName })}</KyaSecondaryButton>
          </div>
        </KyaSheet>
      )}
    </div>
  );
}
