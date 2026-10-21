import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { LegalHeading, LegalPage } from "@/components/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: i18next.t("legal.termsMetaTitle", "Terms of service — Kya & Co.") },
      { name: "description", content: i18next.t("legal.termsMetaDescription", "Terms of service for Kya & Co.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TermsPage,
});

// The terms themselves stay in English: they are the governing wording, and a
// translation would need its own legal review. The page frame is translated.
function TermsPage() {
  const { t } = useTranslation();
  return (
    <LegalPage title={t("legal.termsTitle", "Terms of service")}>
      <LegalHeading>Using the service</LegalHeading>
      <p>
        Kya & Co. is a care plan, health record and coordination app for parrot owners,
        their households and the sitters they invite. It helps you keep your bird's care
        and health in one place and share it with the people who help. It is not
        veterinary advice. In an emergency, contact an avian vet.
      </p>
      <LegalHeading>Your account</LegalHeading>
      <p>
        You're responsible for keeping your sign-in credentials safe and for any sit links
        you share. Revoke a link if you no longer want the sitter to have access.
      </p>
      <LegalHeading>Your content</LegalHeading>
      <p>
        You own the information you add — bird profiles, plans, clips, logs. You grant us
        the permissions needed to store and display it to you and the sitters you authorise.
      </p>
      <LegalHeading>Acceptable use</LegalHeading>
      <p>
        Don't use the service to upload unlawful content, infringe others' rights, or
        attempt to access another account's data.
      </p>
      <LegalHeading>Changes</LegalHeading>
      <p>We may update these terms; significant changes will be communicated in-app or by email.</p>
    </LegalPage>
  );
}
