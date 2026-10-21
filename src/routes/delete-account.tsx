import { createFileRoute } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import i18next from "i18next";
import { SUPPORT_EMAIL } from "@/lib/support";
import { LegalHeading, LegalLink, LegalMail, LegalPage, LegalStrong, LegalUpdated } from "@/components/legal";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: i18next.t("deleteAccountPage.metaTitle", "Delete your account — Kya & Co.") },
      { name: "description", content: i18next.t("deleteAccountPage.metaDescription", "How to delete your Kya & Co. account and what happens to your data.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DeleteAccountPage,
});

/** The support address as a mailto link. */
const mail = <LegalMail href={`mailto:${SUPPORT_EMAIL}`} />;
const b = <LegalStrong />;

function DeleteAccountPage() {
  const { t } = useTranslation();
  const email = { email: SUPPORT_EMAIL };
  return (
    <LegalPage title={t("deleteAccountPage.title", "Delete your account")}>
      <p>
        {t("deleteAccountPage.intro", "Kya & Co. is published by The Kya Project, LLC. This page explains how to delete your account and exactly what happens to your data when you do.")}
      </p>

      <LegalHeading>{t("deleteAccountPage.howHeading", "How to request deletion")}</LegalHeading>
      <p>
        {t("deleteAccountPage.howBody", "You can delete your own account from inside the app, without contacting us. It takes effect immediately.")}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>{t("deleteAccountPage.step1", "Sign in to Kya & Co. — in the app, or at app.thekyaproject.com.")}</li>
        <li>{t("deleteAccountPage.step2", "On Home, tap the settings (gear) icon in the top right.")}</li>
        <li>
          <Trans
            i18nKey="deleteAccountPage.step3"
            defaults="Scroll to the bottom of the Account screen and tap <b>Delete account</b>."
            components={{ b }}
          />
        </li>
        <li>
          <Trans
            i18nKey="deleteAccountPage.step4"
            defaults="Type <b>DELETE</b> to confirm, then tap <b>Permanently delete my account</b>."
            components={{ b }}
          />
        </li>
      </ol>
      <p>
        {t("deleteAccountPage.noWaiting", "There is no waiting period and no recovery step. Everything listed below is removed as soon as you confirm, and you are signed out.")}
      </p>
      <p>
        <Trans
          i18nKey="deleteAccountPage.cantSignIn"
          defaults={'If you can\'t sign in, email <mail>{{email}}</mail> from the address registered to the account, with the subject "Delete my account". We will confirm the request and complete the deletion within 30 days.'}
          values={email}
          components={{ mail }}
        />
      </p>

      <LegalHeading>{t("deleteAccountPage.whatHeading", "What gets deleted")}</LegalHeading>
      <p>{t("deleteAccountPage.whatIntro", "Deleting your account permanently removes:")}</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>{t("deleteAccountPage.whatSignIn", "Your sign-in and every active session.")}</li>
        <li>{t("deleteAccountPage.whatProfile", "Your profile — name, email address, language, and onboarding state.")}</li>
        <li>{t("deleteAccountPage.whatBirds", "Every bird you own, and everything attached to it: care plans and routine tasks, journal entries and their PDF attachments, weight history, daily care logs, health checks, emergency contacts, and moments.")}</li>
        <li>{t("deleteAccountPage.whatSits", "Sits you created, including sitter checklists, completed tasks, and the sitter links themselves — any link you shared stops working immediately.")}</li>
        <li>{t("deleteAccountPage.whatHousehold", "Household access you granted: invitations you sent, each member's permissions, and their access to your birds.")}</li>
        <li>{t("deleteAccountPage.whatDefaults", "Your saved emergency contact defaults, and your archive of past birds.")}</li>
        <li>{t("deleteAccountPage.whatPush", "Push-notification subscriptions and your notification and email history.")}</li>
        <li>{t("deleteAccountPage.whatFiles", "Every file you uploaded — bird photos, journal photos, health-check photos and PDF attachments — together with any care-plan video clips held by our video provider.")}</li>
        <li>{t("deleteAccountPage.whatAnalytics", "The analytics and error reports our analytics provider holds about your account.")}</li>
      </ul>

      <LegalHeading>{t("deleteAccountPage.keepHeading", "What we keep, and for how long")}</LegalHeading>
      <p>
        {t("deleteAccountPage.keepIntro", "We keep nothing about you for legal or billing reasons. Kya & Co. takes no payments and holds no financial records. Two things outlive the deletion:")}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <Trans
            i18nKey="deleteAccountPage.keepBackups"
            defaults="<b>Encrypted database backups.</b> Your written records — birds, care plans, logs, journal entries — may remain in our encrypted daily backups for up to seven days after deletion, and then roll off permanently. Those backups exist only to recover from an outage; they are never used to bring back a deleted account. Your uploaded files work differently: photos, video clips and PDF attachments are removed from storage straight away, and are not part of those backups at all."
            components={{ b }}
          />
        </li>
        <li>
          <Trans
            i18nKey="deleteAccountPage.keepEmailRecord"
            defaults="<b>Email contact record.</b> When you sign up, our email provider keeps a contact record with your email address, name and how you found us, whether or not you opted in to marketing. It is not removed by deleting your account. The unsubscribe link in any of our emails stops further email; to have the record deleted, email <mail>{{email}}</mail> and we will delete it for you."
            values={email}
            components={{ b, mail }}
          />
        </li>
      </ul>

      <LegalHeading>{t("deleteAccountPage.sharedHeading", "Content shared with others")}</LegalHeading>
      <p>
        {t("deleteAccountPage.sharedIntro", "Kya & Co. lets several people care for the same bird, so some of what you wrote may live in another person's account. We do not delete their records of their own bird's care, but your identity is removed from them.")}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>{t("deleteAccountPage.sharedLogged", "Care you logged on someone else's bird — journal entries, weight readings, daily logs — stays with that bird's owner. Your name is removed, and the entry no longer points back to you.")}</li>
        <li>{t("deleteAccountPage.sharedSits", "If you were a caregiver or sitter on someone else's sit, the sit itself stays with its owner; your link to it is removed.")}</li>
        <li>{t("deleteAccountPage.sharedWithYou", "Birds that someone shared with you are not deleted. Your access ends immediately, and the bird and its full history stay with its owner.")}</li>
        <li>{t("deleteAccountPage.sharedTransferred", "A bird you transferred to someone else already belongs to them, and is not affected by deleting your account.")}</li>
      </ul>

      <LegalHeading>{t("deleteAccountPage.questionsHeading", "Questions")}</LegalHeading>
      <p>
        <Trans
          i18nKey="deleteAccountPage.questionsBody"
          defaults="Email <mail>{{email}}</mail>. See also our <privacy>Privacy policy</privacy>."
          values={email}
          components={{ mail, privacy: <LegalLink to="/privacy" /> }}
        />
      </p>

      <LegalUpdated>{t("deleteAccountPage.lastUpdated", "Last updated: 5 September 2026.")}</LegalUpdated>
    </LegalPage>
  );
}
