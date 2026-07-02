import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Kya & Co." },
      { name: "description", content: "How Kya & Co. handles your data." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  // Return to the actual previous screen (signup / settings) when we truly can.
  // canGoBack alone can be true while the browser tab has no prior entry — opened
  // from an email/deep link or a fresh (PWA) load — where router.history.back() is
  // a silent no-op (the reported "back does nothing"). Require a real browser
  // history entry too; otherwise fall back to "/" (which redirects authed users to
  // the dashboard) so the button is never dead.
  const goBack = () => {
    if (canGoBack && typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/" });
    }
  };
  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-2xl px-5 py-8">
        <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Privacy Policy</h1>

        <div className="prose prose-sage mt-6 space-y-4 text-sm leading-relaxed text-sage-700">
          <h2 className="text-base font-bold text-sage-900">What we collect</h2>
          <p>
            Account details (email, display name), bird profiles and care plans you create,
            sit records and sitter activity, photos and clips you upload, and standard
            request/usage metadata.
          </p>
          <h2 className="text-base font-bold text-sage-900">How we use it</h2>
          <p>
            To run the service: store your bird care plans, share them with sitters you invite,
            and surface your data back to you in the app. We do not sell your personal data.
          </p>
          <h2 className="text-base font-bold text-sage-900">Sharing with sitters</h2>
          <p>
            When you create a sit, the invited sitter can access the care plan, contacts, and
            media for the assigned birds while their link is active. Sitter access expires when
            the sit ends, or immediately if you revoke the link.
          </p>
          <h2 className="text-base font-bold text-sage-900">Marketing</h2>
          <p>
            We only send marketing or community updates if you opt in at signup or in account
            settings. You can opt out at any time.
          </p>
          <h2 className="text-base font-bold text-sage-900">Deleting your account</h2>
          <p>
            You can permanently delete your account from account settings. This removes your
            birds, care plans, sits, logs, photos, and marketing-contact record.
          </p>
          <h2 className="text-base font-bold text-sage-900">Contact</h2>
          <p>
            Questions about your data? Email us at{" "}
            <a href="mailto:brittany@thekyaproject.com" className="font-medium text-sage-900 underline">brittany@thekyaproject.com</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
