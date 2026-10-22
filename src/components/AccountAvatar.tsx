import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { K } from "@/components/kya";
import { avatarInitial } from "@/lib/accountInitial";

/**
 * The account entry as the person's avatar: their initial on darker forest, in
 * the same 44px circle as the other header icons. Opens Account, exactly like
 * the gear it replaces. Initials only for now: a provider photo would mean
 * sending its URL through a third-party image proxy or widening the CSP.
 */
export function AccountAvatar() {
  const { t } = useTranslation();
  const [initial, setInitial] = useState("");
  useEffect(() => {
    let cancelled = false;
    void getLocalUser().then(({ data }) => {
      if (!cancelled) setInitial(avatarInitial(data.user?.user_metadata, data.user?.email));
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <Link
      to="/account"
      className="grid size-11 place-items-center rounded-full text-[17px] font-[700] text-white active:scale-95"
      style={{ background: K.forestDeep, boxShadow: `0 0 0 2px ${K.teal}` }}
      aria-label={t("ownerHeader.accountSettings", "Account settings")}
    >
      <span aria-hidden="true">{initial}</span>
    </Link>
  );
}
