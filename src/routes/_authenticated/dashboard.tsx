import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import type { SignedPhoto } from "@/lib/birdPhoto";
import { Plus, Bird as BirdIcon, LogOut, Calendar, Settings, Bell, Feather, HelpCircle } from "lucide-react";
import { OwnerOnboarding, replayOwnerOnboarding } from "@/components/OwnerOnboarding";
import { Disclaimer } from "@/components/Disclaimer";
import { SitCard } from "@/components/SitCard";
import { SitForm } from "@/components/SitForm";
import { OwnerChecklist } from "@/components/OwnerChecklist";
import { toast } from "sonner";
import { computeSetupCompleteness } from "@/lib/setupCompleteness";
import { ASPCA_POISON_CONTROL, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { track } from "@/lib/analytics";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";
import { fetchScanFeed, getNotifSeenAt } from "@/lib/notificationsFeed";

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // Deep-link from a bird's Emergency tab → open + scroll to account defaults.
  emergencyDefaults: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your birds — Parrot Care Co-Pilot" }] }),
  validateSearch: dashboardSearch,
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { newSit, preselectBirdId } = Route.useSearch();

  const { data: profile } = useQuery({
    queryKey: ["owner-profile-name"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return data ?? null;
    },
  });
  const firstName = (profile?.display_name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Welcome, ${firstName}!` : "Welcome!";

  // Unread scan notifications for the bell badge (seen state is per-device).
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const [notifSeenAt] = useState(() => getNotifSeenAt());
  const unreadNotifs = scanFeed.filter((n) => new Date(n.created_at).getTime() > notifSeenAt).length;

  const { data: birds = [], isLoading: birdsLoading, isError: birdsError, refetch: refetchBirds } = useQuery({
    queryKey: ["birds"],
    // Always refetch when Home is (re)mounted so a bird just created/edited in
    // setup appears immediately — the global staleTime would otherwise serve a
    // cached list missing the new bird until something else forced a reload.
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, photo_url, photo_position, setup_complete, setup_step, normal_weight")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const birdIds = useMemo(() => birds.map((b: any) => b.id), [birds]);
  const ownerId = birds[0]?.owner_id as string | undefined;
  // Batch-resolve every bird's photo to a card-sized transform URL.
  const resolvePhoto = useBirdPhotos(birds.map((b: any) => b.photo_url), 800);

  // Pull every input feeding the per-bird completeness indicator in one shot
  // per table to avoid N+1 round trips on the dashboard.
  const { data: completenessData } = useQuery({
    queryKey: ["birds-completeness", birdIds, ownerId],
    enabled: birdIds.length > 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [plansRes, contactsRes, defaultsRes] = await Promise.all([
        supabase.from("care_plans").select("*").in("bird_id", birdIds),
        supabase.from("emergency_contacts").select("*").in("bird_id", birdIds),
        ownerId
          ? supabase
              .from("owner_emergency_defaults")
              .select("*")
              .eq("owner_id", ownerId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      const plans = (plansRes.data ?? []) as any[];
      const planIds = plans.map((p) => p.id);
      const tasksRes = planIds.length
        ? await supabase
            .from("routine_tasks")
            .select("care_plan_id")
            .in("care_plan_id", planIds)
        : { data: [] as any[] };
      const tasksByPlan = new Map<string, number>();
      for (const row of (tasksRes.data ?? []) as any[]) {
        tasksByPlan.set(row.care_plan_id, (tasksByPlan.get(row.care_plan_id) ?? 0) + 1);
      }
      const planByBird = new Map(plans.map((p) => [p.bird_id, p]));
      const contactByBird = new Map(
        ((contactsRes.data ?? []) as any[]).map((c) => [c.bird_id, c]),
      );
      return {
        planByBird,
        tasksByPlan,
        contactByBird,
        defaults: (defaultsRes as any)?.data ?? null,
      };
    },
  });

  const { data: sits = [] } = useQuery({
    queryKey: ["all-sits"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        // Hide internal preview sits used by the setup flow's review screen.
        // (is.null keeps unnamed sits — a bare .neq would drop them, since
        // NULL != '__preview__' is unknown, not true, in Postgres.)
        .or("sitter_name.is.null,sitter_name.neq.__preview__")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/" });
  }

  const refreshSits = () => qc.invalidateQueries({ queryKey: ["all-sits"] });
  const birdLookup = Object.fromEntries(birds.map((b: any) => [b.id, b]));

  const today = new Date().toISOString().slice(0, 10);
  const activeSit = (sits as any[]).find((s) => s.start_date <= today && s.end_date >= today) ?? null;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      {/* Green brand band */}
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pb-6 pt-3">
          <h1 className="text-[27px] font-medium leading-tight text-white">{greeting}</h1>
          <div className="flex items-center gap-1 text-white">
            <Link to="/notifications" className="relative rounded-full p-2 hover:bg-white/10" aria-label="Notifications">
              <Bell className="size-5" />
              {unreadNotifs > 0 && (
                <span className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-warn-red px-1 text-[10px] font-bold leading-4 text-white">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </Link>
            <button onClick={replayOwnerOnboarding} className="rounded-full p-2 hover:bg-white/10" aria-label="Replay walkthrough">
              <HelpCircle className="size-5" />
            </button>
            <Link to="/account" className="rounded-full p-2 hover:bg-white/10" aria-label="Account settings">
              <Settings className="size-5" />
            </Link>
            <button onClick={signOut} className="rounded-full p-2 hover:bg-white/10" aria-label="Sign out">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-6 pt-3">
        <Disclaimer compact />

        <div className="mt-4 space-y-6">
        <OwnerChecklist birds={birds} sits={sits as any[]} />

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[21px] font-medium text-[#1a3d2e]">Your birds</h2>
            <Link to="/birds/new" className="text-sm font-medium text-[#1a3d2e]">+ Add bird</Link>
          </div>
          {birdsLoading ? (
            // Skeleton while loading so an owner with birds never sees the empty
            // state flash before their birds render.
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="overflow-hidden rounded-[20px] bg-[#efe9da] shadow-sm">
                  <div className="h-24 w-full animate-pulse bg-[#e3dcc9]" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[#e3dcc9]" />
                    <div className="h-3 w-1/4 animate-pulse rounded bg-[#e3dcc9]" />
                  </div>
                </div>
              ))}
            </div>
          ) : birdsError ? (
            // A failed fetch must NOT look like "no birds" — that empty state
            // flashed for owners who actually have birds on flaky connections.
            <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
              <BirdIcon className="mx-auto size-8 text-[#2d6a4f]" />
              <p className="mt-3 font-medium text-[#1a3d2e]">Couldn't load your birds</p>
              <p className="mt-1 text-sm text-[#5f5e5a]">Check your connection and try again.</p>
              <button onClick={() => refetchBirds()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
                Retry
              </button>
            </div>
          ) : birds.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
              <BirdIcon className="mx-auto size-8 text-[#2d6a4f]" />
              <p className="mt-3 font-medium text-[#1a3d2e]">Add your first bird</p>
              <p className="mt-1 text-sm text-[#5f5e5a]">Build a care plan once. Reuse and enrich it across every sit.</p>
              <Link to="/birds/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
                <Plus className="size-4" /> Add bird
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {birds.map((b: any) => {
                const plan = completenessData?.planByBird.get(b.id) ?? null;
                const tasksCount = plan ? completenessData?.tasksByPlan.get(plan.id) ?? 0 : 0;
                const contacts = completenessData?.contactByBird.get(b.id) ?? null;
                const defaults = completenessData?.defaults ?? null;
                const completeness = computeSetupCompleteness({ bird: b, plan, tasksCount, contacts, defaults });
                const resumeStep = completeness.firstIncompleteStep ?? Math.max(2, Number(b.setup_step ?? 2));
                return (
                  <BirdCard key={b.id} bird={b} photo={resolvePhoto(b.photo_url)} completeness={completeness} resumeStep={resumeStep} />
                );
              })}
            </div>
          )}
        </section>

        {/* Sit prompt — the one bright accent moment */}
        {birds.length > 0 && (
          <SitForm
            birds={birds}
            onSaved={refreshSits}
            initialOpen={!!newSit}
            preselectBirdId={preselectBirdId}
            activeSit={activeSit}
          />
        )}

        {birds.length > 0 && sits.length > 0 && (
          <section id="sits" className="scroll-mt-4 space-y-3">
            <h2 className="text-[21px] font-medium text-[#1a3d2e]">Sits</h2>
            {(sits as any[]).map((s) => {
              const sitBirds = (s.sit_birds ?? [])
                .map((sb: any) => birdLookup[sb.bird_id])
                .filter(Boolean);
              return <SitCard key={s.id} sit={s} birds={sitBirds} allBirds={birds} onChange={refreshSits} />;
            })}
          </section>
        )}

        {/* Always rendered: emergency defaults are the checklist's first step,
            taken before any bird exists. Gating on birds.length left the
            "Set your emergency defaults" Start button (and the Emergency-tab
            account-defaults link, when no bird yet) navigating to a panel that
            wasn't on the page, so nothing happened. */}
        <DefaultsPanel />

        <AddToHomeScreenPrompt />
        </div>
      </main>

      <OwnerOnboarding />

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:70px}`}</style>
    </div>
  );
}

function BirdCard({ bird, photo, completeness, resumeStep }: { bird: any; photo: SignedPhoto | null; completeness: any; resumeStep: number }) {
  const ready = completeness.pct >= 100;
  const missing = (completeness.checks ?? []).filter((c: any) => !c.done).map((c: any) => c.label);
  const needCount = missing.length;
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();

  return (
    <div className="overflow-hidden rounded-[20px] bg-[#efe9da] shadow-sm">
      <Link to="/birds/$birdId" params={{ birdId: bird.id }} className="block active:scale-[0.99]">
        {/* Photo hero — a filled photo gets a 4:3 frame with a top-biased crop
            so a vertical bird stays in view. The empty state uses a shorter
            band with the bird's initial so it doesn't read as dead space. */}
        <div className={`relative grid w-full place-items-center bg-[#e3dcc9] ${bird.photo_url ? "aspect-[4/3]" : "h-24"}`}>
          {bird.photo_url ? (
            // Frame shape is fixed by the path (known immediately); the image
            // fills in once its signed URL resolves — no layout shift. On a
            // transform failure, fall back to the full-size original.
            photo ? (
              <img
                src={photo.url}
                alt={bird.name}
                loading="lazy"
                decoding="async"
                onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }}
                style={{ objectPosition: bird.photo_position ?? "50% 20%" }}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null
          ) : (
            <span className="flex items-center gap-2 text-[#2d6a4f]">
              <span className="text-3xl font-medium">{initial}</span>
              <Feather className="size-5 opacity-70" />
            </span>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-1 text-[11px] font-medium text-[#1a3d2e] shadow-sm">
            Care plan {completeness.pct}%
          </span>
        </div>
        {/* Name + readiness */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[18px] font-medium leading-tight text-[#1a3d2e]">{bird.name}</p>
              <p className="mt-0.5 text-sm text-[#5f5e5a]">{bird.species ?? "Parrot"}</p>
            </div>
            {ready ? (
              <span className="shrink-0 rounded-full bg-[#d6e8dc] px-3 py-1 text-xs font-medium text-[#1a5e3f]">Ready to share</span>
            ) : (
              <span className="shrink-0 rounded-full bg-[#f4e4c4] px-3 py-1 text-xs font-medium text-[#84600f]">Needs {needCount} {needCount === 1 ? "thing" : "things"}</span>
            )}
          </div>
        </div>
      </Link>
      {!ready && (
        <Link
          to="/birds/$birdId/setup"
          params={{ birdId: bird.id }}
          search={{ step: resumeStep }}
          aria-label={`Care plan ${completeness.pct}% complete — open setup at step ${resumeStep}`}
          className="block border-t border-[#e0d8c4] px-4 py-2.5 transition-colors hover:bg-black/[0.03]"
        >
          <p className="text-xs text-[#5f5e5a]">Add {missing.slice(0, 2).join(" and ").toLowerCase()} to be sitter-ready.</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#e0d8c4]">
            <div className="h-full rounded-full bg-[#2d6a4f] transition-all" style={{ width: `${Math.max(4, completeness.pct)}%` }} />
          </div>
        </Link>
      )}
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}

function DefaultsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { emergencyDefaults: deepLink } = Route.useSearch();
  const sectionRef = useRef<HTMLElement>(null);
  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data ?? { owner_id: u.user.id };
    },
  });
  // Auto-fill poison control with the ASPCA default when the owner hasn't set
  // one, so the number is present without them looking it up.
  const seedDefaults = (base: any) => {
    const v = { ...(base ?? {}) };
    if (!(typeof v.poison_control === "string" && v.poison_control.trim())) {
      v.poison_control = ASPCA_POISON_CONTROL;
    }
    return v;
  };
  const [d, setD] = useState<any>(() => seedDefaults(defaults));
  const [saving, setSaving] = useState(false);
  const fields: [string, string, boolean?][] = [
    ["owner_phone", "Owner phone", true],
    ["backup_name", "Backup contact name"],
    ["backup_phone", "Backup contact phone"],
    ["avian_vet_name", "Avian vet name"],
    ["avian_vet_phone", "Avian vet phone", true],
    ["avian_vet_address", "Avian vet address"],
    ["emergency_vet_name", "Emergency vet name"],
    ["emergency_vet_phone", "Emergency vet phone"],
    ["emergency_vet_address", "Emergency vet address"],
    ["poison_control", "Poison control number"],
    ["carrier_location", "Carrier location"],
    ["first_aid_kit_location", "First-aid kit location"],
    ["spending_limit", "Approved spending limit"],
  ];
  const filledCount = defaults
    ? fields.filter(([k]) => typeof (defaults as any)[k] === "string" && (defaults as any)[k].trim()).length
    : 0;

  // Opened via the Emergency-tab "account defaults" link: expand + scroll here.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!deepLink || seededRef.current || defaults === undefined) return;
    seededRef.current = true;
    setD(seedDefaults(defaults));
    setOpen(true);
    setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [deepLink, defaults]);

  async function save() {
    setSaving(true);
    const { data: u } = await getLocalUser();
    if (!u.user) { toast.error("Signed out."); setSaving(false); return; }
    const row: Record<string, any> = { owner_id: u.user.id };
    for (const [k] of fields) {
      const v = d[k];
      row[k] = typeof v === "string" && v.trim() === "" ? null : v ?? null;
    }
    const { error } = await supabase
      .from("owner_emergency_defaults")
      .upsert(row, { onConflict: "owner_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved. Every bird uses this account info unless you edit it for that bird.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["owner-defaults"] });
  }

  return (
    <section ref={sectionRef} id="emergency-defaults" className="scroll-mt-4 space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="text-[21px] font-medium text-[#1a3d2e]">Account emergency defaults</h2>
        <button
          type="button"
          onClick={() => { setD(seedDefaults(defaults)); setOpen((o) => !o); }}
          className="text-sm font-medium text-[#1a3d2e] underline"
        >
          {open ? "Close" : filledCount > 0 ? "Edit" : "Set up"}
        </button>
      </div>
      <p className="text-xs text-[#5f5e5a]">
        Set owner phone, avian vet, and other emergency info <em>once</em>. Every bird uses this unless you edit it for that bird on its Emergency tab.
      </p>
      {!open ? (
        <div className="rounded-[20px] bg-[#efe9da] p-4 text-xs text-[#5f5e5a]">
          {filledCount === 0
            ? "No defaults set yet — each bird needs its own contacts until you fill these in."
            : `${filledCount} of ${fields.length} default fields set.`}
        </div>
      ) : (
        <div className="space-y-3 rounded-[20px] bg-[#efe9da] p-4">
          {fields.map(([k, l, required]) => {
            const warn = isPhoneField(k) ? phoneWarning(d[k]) : null;
            return (
              <Field key={k} label={required ? `${l} *` : l}>
                <input
                  className="input"
                  inputMode={isPhoneField(k) ? "tel" : undefined}
                  value={d[k] ?? ""}
                  onChange={(e) => setD({ ...d, [k]: e.target.value })}
                  onBlur={isPhoneField(k) ? (e) => setD((prev: any) => ({ ...prev, [k]: formatPhoneOnBlur(e.target.value) })) : undefined}
                />
                {warn && <span className="mt-1 block text-[11px] text-warn-red">{warn}</span>}
              </Field>
            );
          })}
          <button disabled={saving || fields.some(([k]) => isPhoneField(k) && !!phoneWarning(d[k]))} onClick={save} className="mt-2 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save account defaults"}
          </button>
        </div>
      )}
    </section>
  );
}
