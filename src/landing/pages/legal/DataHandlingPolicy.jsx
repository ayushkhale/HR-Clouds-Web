import LegalPage, { Section, Bullets } from "./LegalPage";
import { COMPANY, privacyContact, grievanceContact } from "../../../shared/config/company";

function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="HR Clouds processes payroll, attendance and identity records on behalf of employers. This policy explains what we collect, why, how long we keep it, and the rights you can exercise."
    >
      <Section title="Who this policy covers">
        <p>
          HR Clouds serves two kinds of people, and our obligations differ for each.
        </p>
        <Bullets
          items={[
            <>
              <strong>Employers</strong> who subscribe to HR Clouds. For their own
              account and billing data we are the <em>data fiduciary</em> (controller)
              and decide how that data is used.
            </>,
            <>
              <strong>Employees</strong> whose records an employer stores in HR Clouds.
              For that data we act as a <em>data processor</em> on the employer&rsquo;s
              written instruction. The employer decides what is collected and for how
              long; we hold it and secure it.
            </>,
          ]}
        />
        <p>
          If you are an employee and want a record corrected or erased, raise it with
          your employer&rsquo;s HR team first — they control it. We will help them action it.
        </p>
      </Section>

      <Section title="What we collect">
        <Bullets
          items={[
            "Account data — name, work email, phone number, role, and the organization you belong to.",
            "Employment records — employee code, department, reporting line, designation, joining and exit dates.",
            "Attendance data — clock-in and clock-out times, breaks, overtime, leave and holiday records. Where an employer enables geofenced attendance, this includes the coordinates captured at the moment of a punch.",
            "Payroll data — salary structure, components, earnings and deductions, bank account details for disbursement, and payslips.",
            "Statutory identifiers — PAN, Aadhaar, UAN, PF and ESI numbers, where your employer requires them for compliance.",
            "Documents — files uploaded to the document vault by you or your employer, along with verification status.",
            "Technical data — IP address, browser and device type, and timestamps of security-relevant actions such as sign-in.",
          ]}
        />
        <p>
          We do not collect biometric templates. Where an employer integrates a
          biometric device, the device vendor holds the template and sends HR Clouds
          only the resulting punch event.
        </p>
      </Section>

      <Section title="Why we process it">
        <Bullets
          items={[
            "To deliver the service an employer has subscribed to — recording attendance, calculating pay, issuing payslips, and managing leave and documents.",
            "To meet statutory obligations, including PF, ESI, professional tax and TDS computation and reporting.",
            "To secure the platform — detecting unauthorised access, investigating incidents and maintaining audit logs.",
            "To bill subscribers and to provide support when it is requested.",
          ]}
        />
        <p>
          We do not sell personal data. We do not use employee records to train
          machine-learning models, and we do not use them for advertising.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          We share personal data only where it is necessary to run the service:
        </p>
        <Bullets
          items={[
            "Your employer — an employee's records are visible to authorised HR staff, and to managers within the limits the employer configures. Documents marked confidential are withheld from managers.",
            "Payment processors — subscription payments are handled by Razorpay. We do not store card numbers.",
            "Infrastructure providers — cloud hosting and file storage vendors under contract, bound to process data only on our instruction.",
            "Authorities — where we are compelled by a valid legal order, and only to the extent required.",
          ]}
        />
      </Section>

      <Section title="How long we keep it">
        <p>
          While an employer&rsquo;s subscription is active, their records are retained so
          they remain available. After a subscription ends we retain data for a
          wind-down period so the employer can export it, then delete or irreversibly
          anonymise it.
        </p>
        <p>
          Payroll and statutory records are an exception: Indian tax and labour law
          requires employers to preserve them for a number of years, so those records
          are retained for the statutory period even after an account closes.
        </p>
      </Section>

      <Section title="How we protect it">
        <Bullets
          items={[
            "Traffic between your browser and HR Clouds is encrypted in transit.",
            "Access is role-scoped — an employee sees their own records, a manager sees their team, HR sees the organization. The server authorises every request independently of what the interface shows.",
            "Salary and confidential documents carry additional restrictions that apply even to managers.",
            "Security-relevant actions are written to an audit log.",
          ]}
        />
        <p>
          No system is perfectly secure. If a breach affects your personal data we
          will notify the affected employer and the Data Protection Board as required
          under the Digital Personal Data Protection Act, 2023.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the Digital Personal Data Protection Act, 2023 you may ask to access
          the personal data held about you, to have inaccurate data corrected, to have
          data erased where it is no longer needed, and to nominate someone to
          exercise these rights on your behalf.
        </p>
        <p>
          Employees should raise requests with their employer, who controls the
          record. Employers and account holders can write to us at{" "}
          <a href={`mailto:${privacyContact()}`} className="text-purple-600 font-medium hover:underline">
            {privacyContact()}
          </a>.
        </p>
      </Section>

      <Section title="Grievances">
        <p>
          If you are unhappy with how we have handled your data or your request, you
          can escalate to our grievance officer
          {COMPANY.grievanceOfficer.name ? `, ${COMPANY.grievanceOfficer.name},` : ""}{" "}
          at{" "}
          <a href={`mailto:${grievanceContact()}`} className="text-purple-600 font-medium hover:underline">
            {grievanceContact()}
          </a>
          . We aim to respond within 30 days. You may also complain to the Data
          Protection Board of India.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We update this policy when the service or the law changes. Material changes
          are announced in-product before they take effect, and the revision date at
          the top of this page always reflects the current version.
        </p>
      </Section>
    </LegalPage>
  );
}

export default PrivacyPolicy;
