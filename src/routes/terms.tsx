import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { InkHero } from "@/components/system";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Kya & Co." },
      { name: "description", content: "Terms of use for Kya & Co.." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
      <InkHero backIcon={<ArrowLeft className="size-5" />} onBack={goBack} eyebrow="Legal" headline="Terms of Use" />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="prose prose-sage space-y-4 text-sm leading-relaxed text-sage-700">
          <h2 className="text-base font-bold text-sage-900">Using the service</h2>
          <p>
            Kya & Co. is a tool to help you organise your bird's care and share it
            with sitters. It is not veterinary advice. In an emergency, contact an avian vet.
          </p>
          <h2 className="text-base font-bold text-sage-900">Your account</h2>
          <p>
            You're responsible for keeping your sign-in credentials safe and for any sit links
            you share. Revoke a link if you no longer want the sitter to have access.
          </p>
          <h2 className="text-base font-bold text-sage-900">Your content</h2>
          <p>
            You own the information you add — bird profiles, plans, clips, logs. You grant us
            the permissions needed to store and display it to you and the sitters you authorise.
          </p>
          <h2 className="text-base font-bold text-sage-900">Acceptable use</h2>
          <p>
            Don't use the service to upload unlawful content, infringe others' rights, or
            attempt to access another account's data.
          </p>
          <h2 className="text-base font-bold text-sage-900">Changes</h2>
          <p>We may update these terms; significant changes will be communicated in-app or by email.</p>
        </div>
      </main>
    </div>
  );
}
