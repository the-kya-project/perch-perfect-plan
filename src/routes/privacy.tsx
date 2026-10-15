import { createFileRoute, useNavigate, useRouter, useCanGoBack, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { InkHero } from "@/components/system";

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

const LAST_UPDATED = "15 October 2026";

// Every outside service that receives user data. Keep in sync with the code:
// a new vendor means a new row here and a LAST_UPDATED bump.
const PROCESSORS: { name: string; does: string; data: string }[] = [
  { name: "Supabase", does: "our database, sign-in and file storage", data: "your account details, birds, care plans, sits, logs and photos" },
  { name: "Vercel", does: "hosts the app", data: "the requests your device makes, including your IP address" },
  { name: "Cloudflare Stream", does: "stores and plays care clips", data: "the videos you upload" },
  { name: "Brevo", does: "sends our emails (based in France, data stored in the EU)", data: "your email address, name, language, email preferences and how you found us" },
  { name: "PostHog", does: "product analytics, without cookies", data: "a coded account ID, the screens you use and your device type" },
  { name: "Google Sign-In and Sign in with Apple", does: "let you sign in, if you choose to", data: "the name and email address they share with us" },
  { name: "Apple Push Notification service and Firebase Cloud Messaging", does: "deliver notifications in the iPhone and Android apps", data: "a device token and the notification text" },
  { name: "Your browser's push service", does: "delivers notifications on the website, if you turn them on", data: "a push address for your browser and the notification text" },
];

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
      <InkHero backIcon={<ArrowLeft className="size-5" />} onBack={goBack} eyebrow="Legal" headline="Privacy Policy" />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="prose prose-sage space-y-4 text-sm leading-relaxed text-sage-700">
          <p className="text-xs text-sage-500">Last updated: {LAST_UPDATED}</p>
          <h2 className="text-base font-bold text-sage-900">Who we are</h2>
          <p>
            Kya &amp; Co. is run by The Kya Project, LLC, 3420 S Washington Rd, Fort Wayne, IN
            46802, United States. We're the controller of your personal data, which means we
            decide how it's used and we're responsible for looking after it. You can reach us
            at <a href="mailto:brittany@thekyaproject.com" className="font-medium text-sage-900 underline">brittany@thekyaproject.com</a>.
          </p>
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
          <h2 className="text-base font-bold text-sage-900">Why we're allowed to use your data</h2>
          <p>
            Data protection law asks us to have a reason for everything we do with your data.
            Ours are:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-sage-900">To provide the service you asked for.</strong>{" "}
              Running your account, storing your care plans, sharing them with sitters you
              invite, sending account and sit emails, and sending push notifications you turn on.
            </li>
            <li>
              <strong className="text-sage-900">With your consent.</strong> Marketing and
              community emails. You can withdraw your consent any time.
            </li>
            <li>
              <strong className="text-sage-900">Our legitimate interest</strong> in keeping the
              app working and making it better. That covers product analytics, security and
              fixing bugs. You can object to this (see your rights below).
            </li>
          </ul>
          <h2 className="text-base font-bold text-sage-900">Services that help us run Kya &amp; Co.</h2>
          <p>
            These companies handle data for us, only to provide their service. We don't let
            them use it for their own purposes.
          </p>
          <ul className="space-y-2">
            {PROCESSORS.map((p) => (
              <li key={p.name}>
                <strong className="text-sage-900">{p.name}</strong>: {p.does}. Handles{" "}
                {p.data}.
              </li>
            ))}
          </ul>
          <h2 className="text-base font-bold text-sage-900">Where your data is stored</h2>
          <p>
            Our servers and most of our providers are in the United States. Our database and
            files are stored in the eastern US, so when you use Kya &amp; Co. from the EU or
            UK, your data is transferred to the US. Brevo, our email provider, keeps your
            email details in the EU. We protect those transfers with the European
            Commission's Standard Contractual Clauses, or the EU-US Data Privacy Framework where
            a provider is certified under it.
          </p>
          <h2 className="text-base font-bold text-sage-900">Sharing with sitters</h2>
          <p>
            When you create a sit, the invited sitter can access the care plan, contacts, and
            media for the assigned birds while their link is active. Sitter access expires when
            the sit ends, or immediately if you revoke the link.
          </p>
          <h2 className="text-base font-bold text-sage-900">Marketing</h2>
          <p>
            We only send marketing or community updates if you opt in at signup. You can opt out
            at any time using the unsubscribe link in any of our emails, or by emailing{" "}
            <a href="mailto:brittany@thekyaproject.com" className="font-medium text-sage-900 underline">brittany@thekyaproject.com</a>.
          </p>
          <h2 className="text-base font-bold text-sage-900">Deleting your account</h2>
          <p>
            You can permanently delete your account from account settings. This removes your
            birds, care plans, sits, logs, and photos. Your contact record with our email
            provider is managed separately and is not removed by deleting your account —
            every email we send includes an unsubscribe link, or you can ask us to delete
            it using the address below.{" "}
            <Link to="/delete-account" className="font-medium text-sage-900 underline">
              How to delete your account
            </Link>{" "}
            explains the steps and exactly what is removed.
          </p>
          <h2 className="text-base font-bold text-sage-900">How long we keep your data</h2>
          <p>
            We keep your data while you have an account. When you delete it, we remove it as
            described above. Our database provider keeps daily backups for 7 days, so deleted
            data is gone from backups within a week. Analytics in PostHog is tied to a coded ID,
            never your name or email, and isn't removed automatically when you delete your
            account yet. Email us and we'll delete it.
          </p>
          <h2 className="text-base font-bold text-sage-900">Your rights</h2>
          <p>
            You can ask us to show you the data we hold about you, correct it, delete it, or send
            you a copy in a format you can take elsewhere. You can also ask us to limit how we
            use it, or object to us using it for analytics. Where we rely on your consent, you
            can withdraw it any time. Email <a href="mailto:brittany@thekyaproject.com" className="font-medium text-sage-900 underline">brittany@thekyaproject.com</a> and we'll reply within a month.
          </p>
          <p>
            If you're not happy with how we've handled your data, you can complain to the data
            protection authority in your country. We'd be grateful if you told us first so we can
            try to put it right.
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
