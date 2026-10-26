import { Link } from "react-router-dom";
import LegalPage, { Section, Steps } from "./LegalPage";
import { COMPANY, deletionContact } from "../../../shared/config/company";

/* ─── Employee Account Deletion ────────────────────────────────────────────
   Required by the app stores: an app that holds an account must publish a
   reachable, signed-out page saying how that account gets deleted. It is
   linked from the footer and sits beside the other legal documents, so it
   uses the same LegalPage shell rather than a layout of its own.

   Why it reads the way it does: in HR Clouds an employee account is created
   by their employer, and only HR or an authorised manager can remove it, so
   this page cannot offer a "delete my account" button. It explains the route
   that does exist — ask HR, or write to the developer when the employer is no
   longer reachable. Don't add a self-serve delete control here: there is no
   endpoint behind it, and §2 of CLAUDE.md forbids a button that 403s.

   The addresses come from shared/config/company.js so one edit changes every
   page that prints them.
──────────────────────────────────────────────────────────────────────────── */

function EmployeeAccountDeletion() {
  return (
    <LegalPage
      title="Employee Account Deletion"
      summary="How to have your HR Clouds account and personal data deleted, who can action it, and what is kept afterwards."
    >
      <Section title="Who this applies to">
        <p>
          HR Clouds is built for employees of organizations registered on our
          platform. Your account was created by your employer, and it is managed by
          the HR personnel and managers they have authorised.
        </p>
        <div className="rounded-2xl border border-purple-100 bg-purple-50/70 p-5">
          <p className="font-semibold text-primary-800 mb-1">
            You cannot delete your own account from the app
          </p>
          <p className="text-gray-600">
            Because your employer owns the record, deletion has to be started by
            someone they have authorised. The steps below are how you ask for it.
          </p>
        </div>
      </Section>

      <Section title="How to request account deletion">
        <p>
          To have your account and the personal data attached to it deleted, follow
          these three steps.
        </p>
        <Steps
          items={[
            <>
              <strong>Contact your organization&rsquo;s HR department</strong> or an
              authorised manager.
            </>,
            <>
              <strong>Ask them to delete your HR Clouds account</strong> and the
              personal data held with it.
            </>,
            <>
              <strong>They review the request</strong> and start the deletion, keeping
              to the data-retention requirements that apply to your records.
            </>,
          ]}
        />
        <p>
          If you no longer have access to your organization, write to our support team
          at{" "}
          <a
            href={`mailto:${deletionContact()}`}
            className="text-purple-600 font-medium hover:underline"
          >
            {deletionContact()}
          </a>{" "}
          and we will help you get the deletion actioned.
        </p>
      </Section>

      <Section title="What data will be deleted?">
        <p>
          Once a deletion request is approved, your account information and the
          personal data associated with it are deleted — apart from records we are
          required to keep.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-purple-600 mb-2">
              Deleted
            </p>
            <p className="text-gray-600">
              Your account information and the personal data stored against it.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              Kept
            </p>
            <p className="text-gray-600">
              Only what has to be retained for legal, regulatory, security or business
              recordkeeping reasons.
            </p>
          </div>
        </div>
        <p>
          Anything retained is handled in line with the data protection requirements
          that apply to it and with our{" "}
          <Link to="/legal/privacy" className="text-purple-600 font-medium hover:underline">
            Privacy Policy
          </Link>.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          For deletion requests, or any question about the personal data we hold about
          you, contact:
        </p>
        <dl className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 text-sm space-y-3">
          <div className="sm:flex sm:gap-4">
            <dt className="sm:w-40 font-semibold text-primary-800">App name</dt>
            <dd>{COMPANY.name}</dd>
          </div>
          <div className="sm:flex sm:gap-4">
            <dt className="sm:w-40 font-semibold text-primary-800">Developer</dt>
            <dd>{COMPANY.legalName}</dd>
          </div>
          <div className="sm:flex sm:gap-4">
            <dt className="sm:w-40 font-semibold text-primary-800">Support email</dt>
            <dd>
              <a
                href={`mailto:${deletionContact()}`}
                className="text-purple-600 font-medium hover:underline break-all"
              >
                {deletionContact()}
              </a>
            </dd>
          </div>
        </dl>
      </Section>
    </LegalPage>
  );
}

export default EmployeeAccountDeletion;
