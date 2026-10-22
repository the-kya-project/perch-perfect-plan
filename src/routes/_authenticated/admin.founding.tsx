import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { K, KyaBackRow, KyaBody, KyaCard, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSecondaryButton, KyaTitle } from "@/components/kya";

// Admin-only list of Founding 50 claims. The database is the gate:
// admin_founding_claims() raises "admin only" for anyone else, so this page
// never holds data a non-admin could read. The is_admin() check only decides
// which screen to show. Internal tool, so English only.
export const Route = createFileRoute("/_authenticated/admin/founding")({
  head: () => ({ meta: [
    { title: "Founding 50 claims — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: AdminFounding,
});

type Claim = {
  spot_number: number;
  claimed_at: string;
  name: string | null;
  email: string | null;
  region_slug: string;
  region_name: string | null;
  source: string | null;
};

const DIRECT = "(none)";

function AdminFounding() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });

  const { data: claims, isLoading, error } = useQuery({
    queryKey: ["admin-founding-claims"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_founding_claims");
      if (error) throw error;
      return (data ?? []) as Claim[];
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

  const rows = claims ?? [];
  const bySource = new Map<string, number>();
  for (const c of rows) bySource.set(c.source ?? DIRECT, (bySource.get(c.source ?? DIRECT) ?? 0) + 1);
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label="Back" onBack={back} />
        <KyaTitle title="Founding 50 claims" line={isLoading ? "Loading…" : `${rows.length} of 50 spots claimed`} />
      </KyaHeader>
      <KyaBody>
        {error ? (
          <p role="alert" className="m-0 rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[14px]" style={{ borderColor: K.red, color: K.red }}>
            Couldn't load claims: {(error as Error).message}
          </p>
        ) : isLoading ? null : (
          <>
            <KyaCard className="p-5">
              <KyaHeading size={20}>By source</KyaHeading>
              {sources.length === 0 ? (
                <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>No claims yet.</p>
              ) : (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {sources.map(([s, n]) => (
                    <li key={s} className="flex items-center justify-between text-[15px]" style={{ color: K.ink }}>
                      <span>{s}</span><span className="font-[700]">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </KyaCard>

            <KyaSecondaryButton onClick={() => downloadCsv(rows)} disabled={rows.length === 0} icon={<Download className="size-4" />}>
              Download CSV
            </KyaSecondaryButton>

            <KyaCard>
              {/* Wide on a phone: scrolls sideways, and is focusable so the
                  keyboard can scroll it too. */}
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Claims table">
                <table className="w-full min-w-[640px] border-collapse text-left text-[14px]" style={{ color: K.ink }}>
                  <caption className="sr-only">Founding 50 claims by spot number</caption>
                  <thead>
                    <tr style={{ background: K.mist }}>
                      {["Spot", "Name", "Email", "Region", "Source", "Claimed"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2.5 font-[700]" style={{ color: K.forest }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.spot_number} className="border-t" style={{ borderColor: K.line }}>
                        <td className="px-3 py-2.5 font-[700]">#{c.spot_number}</td>
                        <td className="px-3 py-2.5">{c.name ?? "—"}</td>
                        <td className="px-3 py-2.5">{c.email ?? "—"}</td>
                        <td className="px-3 py-2.5">{c.region_name ?? c.region_slug}</td>
                        <td className="px-3 py-2.5">{c.source ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(c.claimed_at)}</td>
                      </tr>
                    ))}
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
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise formula injection when opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: Claim[]) {
  const header = ["spot_number", "name", "email", "region", "source", "claimed_at"];
  const lines = [header.map(csvCell).join(",")];
  for (const c of rows) {
    lines.push([c.spot_number, c.name, c.email, c.region_name ?? c.region_slug, c.source, c.claimed_at].map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `founding-50-claims-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
