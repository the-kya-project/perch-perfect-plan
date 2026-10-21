import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { LegalHeading, LegalLink, LegalMail, LegalPage, LegalStrong, LegalUpdated } from "@/components/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: i18next.t("legal.privacyMetaTitle", "Privacy policy — Kya & Co.") },
      { name: "description", content: i18next.t("legal.privacyMetaDescription", "How Kya & Co. handles your data.") },
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
  { name: "PostHog", does: "product analytics and error reports, without cookies", data: "a coded account ID, the screens you use, your device type and error reports" },
  { name: "Google Sign-In and Sign in with Apple", does: "let you sign in, if you choose to", data: "the name and email address they share with us" },
  { name: "Apple Push Notification service and Firebase Cloud Messaging", does: "deliver notifications in the iPhone and Android apps", data: "a device token and the notification text" },
  { name: "Your browser's push service", does: "delivers notifications on the website, if you turn them on", data: "a push address for your browser and the notification text" },
];

// The policy text itself stays in English: it is the governing wording, and a
// translation would need its own legal review. The page frame is translated.
function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <LegalPage title={t("legal.privacyTitle", "Privacy policy")}>
      <LegalUpdated>{t("legal.lastUpdated", "Last updated: {{date}}", { date: LAST_UPDATED })}</LegalUpdated>
      <LegalHeading>Who we are</LegalHeading>
      <p>
        Kya &amp; Co. is run by The Kya Project, LLC, 3420 S Washington Rd, Fort Wayne, IN
        46802, United States. We're the controller of your personal data, which means we
        decide how it's used and we're responsible for looking after it. You can reach us
        at <LegalMail href="mailto:brittany@thekyaproject.com">brittany@thekyaproject.com</LegalMail>.
      </p>
      <LegalHeading>What we collect</LegalHeading>
      <p>
        Account details (email, display name), bird profiles and care plans you create,
        sit records and sitter activity, photos and clips you upload, and information
        about how you use the app and, if something goes wrong, error reports (see below).
      </p>
      <LegalHeading>How we use it</LegalHeading>
      <p>
        To run the service: store your bird care plans, share them with sitters you invite,
        and surface your data back to you in the app. We do not sell your personal data.
      </p>
      <LegalHeading>Analytics</LegalHeading>
      <p>
        We use a service called PostHog to understand how the app is used, such as which
        screens people open and which features they rely on. This shows us what's working
        and what needs fixing. PostHog doesn't use cookies, record your screen or see what
        you type. Before anything is sent, we remove links that give access to a care plan,
        sign-in details and private photo links. PostHog knows you by a one-way coded
        version of your account ID, never your name or email address. People using a sitter
        link aren't tied to any account.
      </p>
      <LegalHeading>When something goes wrong</LegalHeading>
      <p>
        If the app runs into an error, it sends us a report so we can find and fix the
        problem, often before you've had to tell us. A report includes the error message, the
        technical trail showing where in our code it happened, the page you were on, the app
        version, your device type and operating system, whether you were using the website or
        the iPhone or Android app, and the same coded account ID we use for analytics. It
        never includes your birds' names, health notes, weights, care plan details, photos,
        your email address or sitter links. Reports go to PostHog and are kept for up to a
        year.
      </p>
      <LegalHeading>Why we're allowed to use your data</LegalHeading>
      <p>
        Data protection law asks us to have a reason for everything we do with your data.
        Ours are:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <LegalStrong>To provide the service you asked for.</LegalStrong>{" "}
          Running your account, storing your care plans, sharing them with sitters you
          invite, sending account and sit emails, and sending push notifications you turn on.
        </li>
        <li>
          <LegalStrong>With your consent.</LegalStrong> Marketing and
          community emails. You can withdraw your consent any time.
        </li>
        <li>
          <LegalStrong>Our legitimate interest</LegalStrong> in keeping the
          app working and making it better. That covers product analytics, security and
          fixing bugs. You can object to this (see your rights below).
        </li>
      </ul>
      <LegalHeading>Services that help us run Kya &amp; Co.</LegalHeading>
      <p>
        These companies handle data for us, only to provide their service. We don't let
        them use it for their own purposes.
      </p>
      <ul className="space-y-2">
        {PROCESSORS.map((p) => (
          <li key={p.name}>
            <LegalStrong>{p.name}</LegalStrong>: {p.does}. Handles{" "}
            {p.data}.
          </li>
        ))}
      </ul>
      <LegalHeading>Where your data is stored</LegalHeading>
      <p>
        Our servers and most of our providers are in the United States. Our database and
        files are stored in the eastern US, so when you use Kya &amp; Co. from the EU or
        UK, your data is transferred to the US. Brevo, our email provider, keeps your
        email details in the EU. We protect those transfers with the European
        Commission's Standard Contractual Clauses, or the EU-US Data Privacy Framework where
        a provider is certified under it.
      </p>
      <LegalHeading>Sharing with sitters</LegalHeading>
      <p>
        When you create a sit, the invited sitter can access the care plan, contacts, and
        media for the assigned birds while their link is active. Sitter access expires when
        the sit ends, or immediately if you revoke the link.
      </p>
      <LegalHeading>Marketing</LegalHeading>
      <p>
        We only send marketing or community updates if you opt in at signup. You can opt out
        at any time using the unsubscribe link in any of our emails, or by emailing{" "}
        <LegalMail href="mailto:brittany@thekyaproject.com">brittany@thekyaproject.com</LegalMail>.
      </p>
      <LegalHeading>Deleting your account</LegalHeading>
      <p>
        You can permanently delete your account from account settings. This removes your
        birds, care plans, sits, logs, and photos, and the analytics and error data PostHog
        holds about your account. Your contact record with our email
        provider is managed separately and is not removed by deleting your account —
        every email we send includes an unsubscribe link, or you can ask us to delete
        it using the address below.{" "}
        <LegalLink to="/delete-account">
          How to delete your account
        </LegalLink>{" "}
        explains the steps and exactly what is removed.
      </p>
      <LegalHeading>How long we keep your data</LegalHeading>
      <p>
        We keep your data while you have an account. When you delete it, we remove it as
        described above. Our database provider keeps daily backups for 7 days, so deleted
        data is gone from backups within a week. Error reports are kept for up to a year, or
        until you delete your account.
      </p>
      <LegalHeading>Your rights</LegalHeading>
      <p>
        You can ask us to show you the data we hold about you, correct it, delete it, or send
        you a copy in a format you can take elsewhere. You can also ask us to limit how we
        use it, or object to us using it for analytics. Where we rely on your consent, you
        can withdraw it any time. Email <LegalMail href="mailto:brittany@thekyaproject.com">brittany@thekyaproject.com</LegalMail> and we'll reply within a month.
      </p>
      <p>
        If you're not happy with how we've handled your data, you can complain to the data
        protection authority in your country. We'd be grateful if you told us first so we can
        try to put it right.
      </p>
      <LegalHeading>Contact</LegalHeading>
      <p>
        Questions about your data? Email us at{" "}
        <LegalMail href="mailto:brittany@thekyaproject.com">brittany@thekyaproject.com</LegalMail>.
      </p>
    </LegalPage>
  );
}
