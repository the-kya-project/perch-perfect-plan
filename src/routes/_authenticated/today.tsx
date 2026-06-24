import { createFileRoute } from "@tanstack/react-router";
import { CaregiverHome, CaregiverEmpty, CaregiverLoading, useActiveCaregiver } from "@/components/CaregiverHome";
import { InkHero } from "@/components/system";

// /today — the active-caregiver Today view. Dedicated route reached from the
// bottom nav's second tab (Sits → Today swap while an assignment is active).
// When no assignment is active, falls back to a calm empty state with the
// upcoming-assignment countdown ("Today's check starts in N days").
export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — Parrot Care Co-Pilot" }] }),
  component: TodayPage,
});

function TodayPage() {
  const { data, isLoading } = useActiveCaregiver();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <InkHero eyebrow="Today" headline="Loading…" />
          <main className="px-5 pt-5"><CaregiverLoading /></main>
        </div>
      </div>
    );
  }
  if (!data || data.sits.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <InkHero eyebrow="Today" headline="Nothing on for today." />
          <main className="px-5 pt-5"><CaregiverEmpty upcoming={data?.upcoming ?? null} /></main>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <CaregiverHome data={data} />
      </div>
    </div>
  );
}
