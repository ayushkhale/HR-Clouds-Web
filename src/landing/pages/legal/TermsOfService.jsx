import LegalPage, { Section, Bullets } from "./LegalPage";
import { COMPANY } from "../../../shared/config/company";

function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms govern your use of HR Clouds. By creating an organization or signing in, you agree to them."
    >
      <Section title="The agreement">
        <p>
          These terms are between {COMPANY.legalName || COMPANY.name} and the
          organization that subscribes to HR Clouds. If you accept them on behalf of
          an employer, you confirm you are authorised to bind that employer.
        </p>
        <p>
          Individual users — employees and managers invited into an organization —
          also agree to these terms when they sign in, but the subscription itself is
          held by their employer.
        </p>
      </Section>

      <Section title="Your account">
        <Bullets
          items={[
            "You are responsible for the accuracy of the details you register, and for keeping your credentials confidential.",
            "You must tell us promptly if you believe an account has been accessed without authorisation.",
            "Accounts are personal. Sharing a single login between people defeats the audit log and is not permitted.",
            "We may suspend an account that is being used to breach these terms or to compromise the platform.",
          ]}
        />
      </Section>

      <Section title="Plans, billing and renewal">
        <Bullets
          items={[
            "Plan prices, seat limits and included modules are listed on our pricing page and are charged for the whole workspace, not per employee.",
            "Paid plans are billed in advance — monthly or annually, according to the plan you choose — and are processed by Razorpay.",
            "Prices are in Indian Rupees and exclude applicable taxes unless stated otherwise.",
            "Exceeding your plan's employee, manager or HR account limit requires an upgrade. We will notify you in-product as you approach a limit.",
            "You may change plans at any time. An upgrade takes effect immediately; a downgrade takes effect at the start of the next billing cycle.",
            "The Free plan is provided as-is and may be changed or withdrawn with reasonable notice.",
          ]}
        />
      </Section>

      <Section title="What you may not do">
        <Bullets
          items={[
            "Use HR Clouds to store data you have no lawful basis to hold, or to process an employee's data for a purpose they were never told about.",
            "Attempt to access another organization's data, probe the platform for vulnerabilities without written permission, or circumvent role-based restrictions.",
            "Resell, sublicense or white-label the service without a written agreement.",
            "Upload malware, or content that is unlawful or infringes someone else's rights.",
            "Use automated means to extract data at a scale that degrades the service for others.",
          ]}
        />
      </Section>

      <Section title="Your data stays yours">
        <p>
          You retain all rights to the data your organization puts into HR Clouds. We
          claim no ownership over it. We process it to provide the service, as set out
          in our Privacy Policy, and for no other purpose.
        </p>
        <p>
          You can export your data at any time while your subscription is active. On
          termination we provide a wind-down period for export before deletion.
        </p>
      </Section>

      <Section title="Availability and support">
        <p>
          We work to keep HR Clouds available continuously, but we do not guarantee
          uninterrupted service. Planned maintenance is announced in advance where
          practical. Support is provided by email at all plan levels; response
          priority varies by plan.
        </p>
      </Section>

      <Section title="Compliance is a shared responsibility">
        <p>
          HR Clouds computes statutory deductions such as PF, ESI, professional tax
          and TDS using the rules and rates configured in your account. The software
          is a tool, not an advisor. Responsibility for the accuracy of what you
          file, and for meeting filing deadlines, remains with the employer. See our{" "}
          <a href="/legal/statutory" className="text-purple-600 font-medium hover:underline">
            Statutory Guidelines
          </a>{" "}
          for detail.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          To the extent permitted by law, neither party is liable for indirect or
          consequential loss, and our total liability in any twelve-month period is
          limited to the subscription fees you paid in that period. Nothing in these
          terms limits liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="Ending the agreement">
        <p>
          You may cancel at any time; cancellation takes effect at the end of the
          current billing period and we do not refund fees already paid for that
          period unless the law requires it. We may terminate for material breach
          that is not remedied after notice, or for non-payment.
        </p>
      </Section>

      <Section title="Changes and governing law">
        <p>
          We may revise these terms. Material changes are announced in-product before
          they take effect; continuing to use HR Clouds after that constitutes
          acceptance. These terms are governed by the laws of India, and the courts of{" "}
          {COMPANY.jurisdiction} have exclusive jurisdiction.
        </p>
      </Section>
    </LegalPage>
  );
}

export default TermsOfService;
