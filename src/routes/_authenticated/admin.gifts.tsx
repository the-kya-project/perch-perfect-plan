import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/gifts";
import { K, KyaBackRow, KyaBody, KyaCard, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSecondaryButton, KyaTitle } from "@/components/kya";

// Admin-only list of gift memberships. RLS on gift_purchases is the gate: a
// non-admin's select returns only gifts they redeemed themselves, and this page
// doesn't query at all unless is_admin() says yes. Internal tool, so English
// only (like /admin/founding).
export const Route = createFileRoute("/_authenticated/admin/gifts")({
  head: () => ({ meta: [
    { title: "Gift memberships — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: AdminGifts,
});

type Gift = {
  purchased_at: string;
  plan: string;
  buyer_email: string;
  buyer_name: string | null;
  recipient_name: string;
  recipient_email: string | null;
  send_on: string | null;
  amount_paid_cents: number;
  promo_code: string | null;
  giving_rate: number;
  status: string;
  gift_code: string;
};

const PLAN_LABEL: Record<string, string> = { flock_year: "The Flock, 1 year", app_premium_year: "App premium, 1 year" };
const NO_PROMO = "(none)";

function AdminGifts() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });

  const { data: gifts, isLoading, error } = useQuery({
    queryKey: ["admin-gifts"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_purchases")
        .select("purchased_at, plan, buyer_email, buyer_name, recipient_name, recipient_email, send_on, amount_paid_cents, promo_code, giving_rate, status, gift_code")
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((g) => ({ ...g, giving_rate: Number(g.giving_rate) })) as Gift[];
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

  const rows = gifts ?? [];
  // Refunded gifts are listed but kept out of the money totals.
  const counted = rows.filter((g) => g.status !== "refunded");
  const total = counted.reduce((n, g) => n + g.amount_paid_cents, 0);
  const giving = counted.reduce((n, g) => n + Math.round(g.amount_paid_cents * g.giving_rate), 0);
  const byPlan = group(counted, (g) => PLAN_LABEL[g.plan] ?? g.plan);
  const byPromo = group(counted, (g) => g.promo_code ?? NO_PROMO);

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label="Back" onBack={back} />
        <KyaTitle
          title="Gift memberships"
          line={isLoading ? "Loading…" : `${counted.length} paid ${counted.length === 1 ? "gift" : "gifts"} · ${formatCents(total)} · ${formatCents(giving)} to rescue and conservation`}
        />
      </KyaHeader>
      <KyaBody>
        {error ? (
          <p role="alert" className="m-0 rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[14px]" style={{ borderColor: K.red, color: K.red }}>
            Couldn't load gifts: {(error as Error).message}
          </p>
        ) : isLoading ? null : (
          <>
            <Totals title="By plan" groups={byPlan} />
            <Totals title="By promo code" groups={byPromo} />

            <KyaSecondaryButton onClick={() => downloadCsv(rows)} disabled={rows.length === 0} icon={<Download className="size-4" />}>
              Download CSV
            </KyaSecondaryButton>

            <KyaCard>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Gifts table">
                <table className="w-full min-w-[900px] border-collapse text-left text-[14px]" style={{ color: K.ink }}>
                  <caption className="sr-only">Gift memberships, newest first. Refunded gifts are listed but not counted in totals.</caption>
                  <thead>
                    <tr style={{ background: K.mist }}>
                      {["Date", "Plan", "Buyer", "Recipient", "Amount", "Promo code", "Giving", "Status"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2.5 font-[700]" style={{ color: K.forest }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.gift_code} className="border-t" style={{ borderColor: K.line }}>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatDate(g.purchased_at)}</td>
                        <td className="px-3 py-2.5">{PLAN_LABEL[g.plan] ?? g.plan}</td>
                        <td className="px-3 py-2.5">{g.buyer_name ? `${g.buyer_name} · ` : ""}{g.buyer_email}</td>
                        <td className="px-3 py-2.5">{g.recipient_name}{g.recipient_email ? ` · ${g.recipient_email}` : " · (to buyer)"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatCents(g.amount_paid_cents)}</td>
                        <td className="px-3 py-2.5">{g.promo_code ?? "—"}</td>
                        <td className="px-3 py-2.5">{Math.round(g.giving_rate * 100)}%</td>
                        <td className="px-3 py-2.5 font-[700]" style={{ color: g.status === "refunded" ? K.red : K.forest }}>{g.status}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-4" style={{ color: K.quiet }}>No gifts yet.</td></tr>
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

type Group = { key: string; count: number; cents: number };

function group(rows: Gift[], keyOf: (g: Gift) => string): Group[] {
  const m = new Map<string, Group>();
  for (const g of rows) {
    const k = keyOf(g);
    const cur = m.get(k) ?? { key: k, count: 0, cents: 0 };
    cur.count++;
    cur.cents += g.amount_paid_cents;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key));
}

function Totals({ title, groups }: { title: string; groups: Group[] }) {
  return (
    <KyaCard className="p-5">
      <KyaHeading size={20}>{title}</KyaHeading>
      {groups.length === 0 ? (
        <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>No paid gifts yet.</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {groups.map((g) => (
            <li key={g.key} className="flex items-center justify-between gap-3 text-[15px]" style={{ color: K.ink }}>
              <span className="min-w-0">{g.key}</span>
              <span className="whitespace-nowrap font-[700]">{g.count} · {formatCents(g.cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </KyaCard>
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

function downloadCsv(rows: Gift[]) {
  const header = ["purchased_at", "plan", "buyer_name", "buyer_email", "recipient_name", "recipient_email", "send_on", "amount_paid", "promo_code", "giving_rate", "status"];
  const lines = [header.map(csvCell).join(",")];
  for (const g of rows) {
    lines.push([
      g.purchased_at, g.plan, g.buyer_name, g.buyer_email, g.recipient_name, g.recipient_email, g.send_on,
      (g.amount_paid_cents / 100).toFixed(2), g.promo_code, g.giving_rate, g.status,
    ].map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gift-memberships-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
