import { createFileRoute, useNavigate, useRouter, useCanGoBack, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { InkHero } from "@/components/system";

// TODO: replace <SUPPORT_EMAIL> below with the real support address.
// It appears twice: the "can't sign in" fallback and the marketing-contact note.
const SUPPORT_EMAIL = "<SUPPORT_EMAIL>";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your account — Kya & Co." },
      { name: "description", content: "How to delete your Kya & Co. account and what happens to your data." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
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
      <InkHero
        backIcon={<ArrowLeft className="size-5" />}
        onBack={goBack}
        eyebrow="Legal"
        headline="Delete your Kya & Co. account"
      />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="prose prose-sage space-y-4 text-sm leading-relaxed text-sage-700">
          <p>
            Kya & Co. is published by The Kya Project, LLC. This page explains how to delete your
            account and exactly what happens to your data when you do.
          </p>

          <h2 className="text-base font-bold text-sage-900">How to request deletion</h2>
          <p>
            You can delete your own account from inside the app, without contacting us. It takes
            effect immediately.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Sign in to Kya &amp; Co. — in the app, or at app.thekyaproject.com.</li>
            <li>On Home, tap the settings (gear) icon in the top right.</li>
            <li>
              Scroll to the bottom of the Account screen and tap{" "}
              <strong className="font-medium text-sage-900">Delete account</strong>.
            </li>
            <li>
              Type <strong className="font-medium text-sage-900">DELETE</strong> to confirm, then tap{" "}
              <strong className="font-medium text-sage-900">Permanently delete my account</strong>.
            </li>
          </ol>
          <p>
            There is no waiting period and no recovery step. Everything listed below is removed as
            soon as you confirm, and you are signed out.
          </p>
          <p>
            If you can't sign in, email {SUPPORT_EMAIL} from the address registered to the account,
            with the subject "Delete my account". We will confirm the request and complete the
            deletion within 30 days.
          </p>

          <h2 className="text-base font-bold text-sage-900">What gets deleted</h2>
          <p>Deleting your account permanently removes:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your sign-in and every active session.</li>
            <li>Your profile — name, email address, language, and onboarding state.</li>
            <li>
              Every bird you own, and everything attached to it: care plans and routine tasks,
              journal entries and their PDF attachments, weight history, daily care logs, health
              checks, emergency contacts, and moments.
            </li>
            <li>
              Sits you created, including sitter checklists, completed tasks, and the sitter links
              themselves — any link you shared stops working immediately.
            </li>
            <li>
              Household access you granted: invitations you sent, each member's permissions, and
              their access to your birds.
            </li>
            <li>Your saved emergency contact defaults, and your archive of past birds.</li>
            <li>Push-notification subscriptions and your notification and email history.</li>
            <li>
              Every file you uploaded — bird photos, journal photos, health-check photos and PDF
              attachments — together with any care-plan video clips held by our video provider.
            </li>
          </ul>

          <h2 className="text-base font-bold text-sage-900">What we keep, and for how long</h2>
          <p>
            We keep nothing about you for legal or billing reasons. Kya &amp; Co. takes no payments
            and holds no financial records. Two things outlive the deletion:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="font-medium text-sage-900">Encrypted database backups.</strong>{" "}
              Deleted data remains in routine backups for up to 7 days, after which it rolls off
              permanently. Backups are used only to recover from an outage, never to restore a
              deleted account.
            </li>
            <li>
              <strong className="font-medium text-sage-900">Marketing contact record.</strong> If you
              opted in to marketing or community email, that contact record is held by our email
              provider and is not removed by deleting your account. Use the unsubscribe link in any
              of our emails to remove it, or email {SUPPORT_EMAIL} and we will delete it for you.
            </li>
          </ul>

          <h2 className="text-base font-bold text-sage-900">Content shared with others</h2>
          <p>
            Kya &amp; Co. lets several people care for the same bird, so some of what you wrote may
            live in another person's account. We do not delete their records of their own bird's
            care, but your identity is removed from them.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Care you logged on someone else's bird — journal entries, weight readings, daily logs —
              stays with that bird's owner. Your name is removed, and the entry no longer points back
              to you.
            </li>
            <li>
              If you were a caregiver or sitter on someone else's sit, the sit itself stays with its
              owner; your link to it is removed.
            </li>
            <li>
              Birds that someone shared with you are not deleted. Your access ends immediately, and
              the bird and its full history stay with its owner.
            </li>
            <li>
              A bird you transferred to someone else already belongs to them, and is not affected by
              deleting your account.
            </li>
          </ul>

          <h2 className="text-base font-bold text-sage-900">Questions</h2>
          <p>
            Email {SUPPORT_EMAIL}. See also our{" "}
            <Link to="/privacy" className="font-medium text-sage-900 underline">Privacy Policy</Link>.
          </p>

          <p className="text-xs text-sage-600">Last updated: 5 September 2026.</p>
        </div>
      </main>
    </div>
  );
}
