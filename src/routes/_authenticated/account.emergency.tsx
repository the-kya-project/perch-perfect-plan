import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { friendlyError } from "@/lib/errorMessage";
import { K, KyaPage, KyaHeader, KyaBody, KyaBackRow, KyaTitle } from "@/components/kya";
import { EmergencyList, EmergencyRowSheet, type EmergencyValues, type RowKey } from "@/components/EmergencyContacts";
import { useOwnerEmergency, useOwnerName } from "@/lib/useOwnerEmergency";

// Account emergency info: what a sitter sees if something goes wrong. Every
// bird uses these values unless that bird has its own (see the bird's
// emergency page). Stored in owner_emergency_defaults.
export const Route = createFileRoute("/_authenticated/account/emergency")({
  head: () => ({ meta: [{ title: i18next.t("accountEmergency.metaTitle", "Emergency info — Kya & Co.") }] }),
  component: AccountEmergency,
});

function AccountEmergency() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const { data: defaults } = useOwnerEmergency();
  const { data: ownerName = "" } = useOwnerName();
  const [editing, setEditing] = useState<RowKey | null>(null);
  const [saving, setSaving] = useState(false);
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  async function save(patch: Record<string, string | null>) {
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      if (!u.user) throw new Error(t("accountEmergency.signedOut", "Signed out."));
      const { error } = await supabase.from("owner_emergency_defaults").upsert({ owner_id: u.user.id, ...patch } as any, { onConflict: "owner_id" });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["owner-defaults"] });
      qc.invalidateQueries({ queryKey: ["care-plan-status"] });
      setEditing(null);
      toast.success(t("accountEmergency.saved", "Saved for all your birds."));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const values = (defaults ?? {}) as EmergencyValues;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <KyaBackRow label={t("accountEmergency.back", "Back")} onBack={goBack} />
          <KyaTitle
            title={t("accountEmergency.title", "Emergency info")}
            line={t("accountEmergency.line", "What a sitter sees if something goes wrong. Tap any line to change it.")}
          />
        </KyaHeader>
        <KyaBody className="gap-5">
          {defaults === undefined ? (
            <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("accountEmergency.loading", "Loading…")}</p>
          ) : (
            <EmergencyList values={values} ownerName={ownerName} editable onEdit={setEditing} />
          )}
        </KyaBody>
      </div>
      {editing && <EmergencyRowSheet rowKey={editing} initial={values} saving={saving} onSave={save} onClose={() => setEditing(null)} />}
    </KyaPage>
  );
}
