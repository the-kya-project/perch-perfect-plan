import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { NO_FLOCK_DATES, type FlockPublicDates } from "./flockDates";
import { getFlockPublicDates } from "./flockDates.functions";

/** The two dates for the founding, gift and redeem pages. Empty until loaded,
 *  so the first render always shows the undated wording. */
export function useFlockPublicDates(): FlockPublicDates {
  const fn = useServerFn(getFlockPublicDates);
  const { data } = useQuery({ queryKey: ["flock-public-dates"], queryFn: () => fn(), staleTime: 5 * 60_000 });
  return data ?? NO_FLOCK_DATES;
}
