import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { K, KyaBackRow, KyaBody, KyaCard, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaTitle } from "@/components/kya";

// Admin-only view of Kya's Crew sponsored seats (backlog 1.15). Each Crew
// membership sponsors six months in the Flock for a new rescue adopter; rescue
// partner codes (1.16) use the seats. The functions refuse anyone but admins,
// and this page doesn't query them unless is_admin() says yes. Internal tool,
// so English only (like /admin/gifts). No names or emails.
export const Route = createFileRoute("/_authenticated/admin/crew")({
  head: () => ({ meta: [
    { title: "Kya's Crew seats — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: AdminCrew,
});

type Summary = { crew_members: number; sponsored: number; used: number; available: number };
type Seat = { sponsored_at: string; months: number; plan: string | null; sponsor_still_crew: boolean };

const CREW_RULES =
  "Kya's Crew is $37 a month billed annually ($444 a year) or $45 month to month, with everything in a Flock membership and 25% to rescue and conservation partners. Each Crew membership sponsors six months in the Flock for a new rescue adopter, once its first payment goes through. A seat stays sponsored when the membership ends.";

const PLAN_LABEL: Record<string, string> = { crew_monthly: "Monthly", crew_annual: "Yearly" };

function AdminCrew() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["admin-crew-summary"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_crew_sponsorship_summary");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        crew_members: Number(row.crew_members ?? 0),
        sponsored: Number(row.sponsored ?? 0),
        used: Number(row.used ?? 0),
        available: Number(row.available ?? 0),
      } as Summary;
    },
  });

  const { data: seats } = useQuery({
    queryKey: ["admin-crew-seats"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_crew_sponsorships");
      if (error) throw error;
      return (data ?? []) as Seat[];
    },
  });

  const back = () => void navigate({ to: "/dashboard" });

  if (adminLoading) {
    return (
      <KyaPage>
        <div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading">
          <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
        </div>
      </KyaPage>
    );
  }

  if (!isAdmin) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label="Back" onBack={back} />
          <KyaTitle title="Page not available" line="This page is only for Kya & Co. admins." />
        </KyaHeader>
        <KyaBody>
          <KyaPrimaryButton onClick={back}>Go to Home</KyaPrimaryButton>
        </KyaBody>
      </KyaPage>
    );
  }

  const s = summary;
  const line = isLoading || !s
    ? "Loading…"
    : `${s.crew_members} Crew ${s.crew_members === 1 ? "member" : "members"} · ${s.sponsored} sponsored · ${s.used} used · ${s.available} available`;
  const rows = seats ?? [];

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label="Back" onBack={back} />
        <KyaTitle title="Kya's Crew seats" line={line} />
      </KyaHeader>
      <KyaBody>
        {error ? (
          <p role="alert" className="m-0 rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[14px]" style={{ borderColor: K.red, color: K.red }}>
            Couldn't load Crew seats: {(error as Error).message}
          </p>
        ) : isLoading || !s ? null : (
          <>
            <p className="m-0 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>{CREW_RULES}</p>
            {s.available < 0 && (
              <p role="alert" data-testid="crew-seats-negative" className="m-0 rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[14px]" style={{ borderColor: K.red, color: K.red }}>
                More seats have been used than Crew members have sponsored ({-s.available} over). Rescue adopters still get in.
              </p>
            )}
            <KyaCard className="p-5">
              <KyaHeading size={20}>Seats</KyaHeading>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {([
                  ["Sponsored", s.sponsored],
                  ["Used", s.used],
                  ["Available", s.available],
                  ["Crew members now", s.crew_members],
                ] as const).map(([label, value]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-[15px]" style={{ color: K.ink }}>
                    <span className="min-w-0">{label}</span>
                    <span className="whitespace-nowrap font-[700]" style={{ color: label === "Available" && value < 0 ? K.red : K.ink }}>{value}</span>
                  </li>
                ))}
              </ul>
            </KyaCard>

            <KyaCard>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sponsored seats table">
                <table className="w-full min-w-[520px] border-collapse text-left text-[14px]" style={{ color: K.ink }}>
                  <caption className="sr-only">Sponsored seats, newest first.</caption>
                  <thead>
                    <tr style={{ background: K.mist }}>
                      {["Sponsored", "Seat", "Crew plan", "Sponsor still in the Crew"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2.5 font-[700]" style={{ color: K.forest }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.sponsored_at}-${i}`} className="border-t" style={{ borderColor: K.line }}>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatDate(r.sponsored_at)}</td>
                        <td className="px-3 py-2.5">{r.months} months</td>
                        <td className="px-3 py-2.5">{(r.plan && PLAN_LABEL[r.plan]) ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.sponsor_still_crew ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-4" style={{ color: K.quiet }}>No seats sponsored yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </KyaCard>
          </>
        )}
      </KyaBody>
    </KyaPage>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
