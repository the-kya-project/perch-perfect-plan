// The poison line the owner's own screens fall back to when no number is
// entered: decided by the owner's home time zone (Account → Time zone), else
// the device's. Shares the account page's query, so it's one request.
import { useQuery } from "@tanstack/react-query";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { ACCOUNT_TIME_ZONE_KEY } from "@/components/TimeZoneSheet";
import { fetchAccountTimeZone } from "@/lib/sitTimeZoneBackfill";
import { deviceTimeZone } from "@/lib/sitTimeZone";
import { defaultPoisonLine, type PoisonLine } from "@/lib/poisonControl";

export function useHomePoisonLine(): PoisonLine | null {
  const { data: timeZone = null } = useQuery({
    queryKey: ACCOUNT_TIME_ZONE_KEY,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      return u.user ? fetchAccountTimeZone(u.user.id) : null;
    },
  });
  return defaultPoisonLine(timeZone ?? deviceTimeZone());
}
