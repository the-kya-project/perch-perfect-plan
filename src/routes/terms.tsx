import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

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
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/" }));
  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-2xl px-5 py-8">
        <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Terms of Use</h1>

        <div className="prose prose-sage mt-6 space-y-4 text-sm leading-relaxed text-sage-700">
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
