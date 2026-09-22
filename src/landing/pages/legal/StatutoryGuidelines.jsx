import LegalPage, { Section, Bullets } from "./LegalPage";
import { COMPANY } from "../../../shared/config/company";

function StatutoryGuidelines() {
  return (
    <LegalPage
      title="Statutory Guidelines"
      summary="How HR Clouds handles Indian payroll compliance — what the platform computes for you, and what remains the employer's responsibility."
    >
      <Section title="Read this first">
        <p>
          HR Clouds is payroll software, not a tax advisor, chartered accountant or
          labour-law consultant. It applies the statutory rules and rates configured
          in your account to the data you enter. Responsibility for the correctness of
          your filings, and for meeting every deadline, stays with the employer.
        </p>
        <p>
          Nothing on this page is legal or tax advice. Where your circumstances are
          unusual — multi-state operations, contract labour, international
          assignments — take professional advice.
        </p>
      </Section>

      <Section title="Provident Fund (EPF)">
        <Bullets
          items={[
            "The platform computes employee and employer PF contributions from the components you have marked as PF-applicable in the salary structure.",
            "The statutory wage ceiling is applied where you have configured it; employers who contribute above the ceiling can set that per structure.",
            "Employer contributions are a cost to the company and sit outside the employee's annual CTC figure shown on salary screens.",
            "UAN and PF numbers are stored against the employee record for use in your ECR filing. HR Clouds does not file the ECR on your behalf.",
          ]}
        />
      </Section>

      <Section title="Employees' State Insurance (ESI)">
        <Bullets
          items={[
            "ESI is computed for employees whose gross wages fall under the eligibility threshold configured in your account.",
            "Both employee and employer shares are calculated and shown separately on the payslip.",
            "Eligibility is re-evaluated each contribution period, so an employee crossing the threshold mid-period is handled according to the rules you have configured.",
          ]}
        />
      </Section>

      <Section title="Professional Tax">
        <Bullets
          items={[
            "Professional tax is state-specific. The slab applied depends on the work location assigned to the employee.",
            "Employers operating across multiple states must configure each location so the right slab is used.",
            "Registration and payment to the relevant state authority remain the employer's responsibility.",
          ]}
        />
      </Section>

      <Section title="Income tax (TDS)">
        <Bullets
          items={[
            "TDS is estimated across the financial year from projected earnings, declared investments and the tax regime the employee has selected.",
            "Employees can record declarations and submit proofs; HR reviews and approves them, and approved proofs feed the computation.",
            "Recomputation happens when salary, declarations or regime selection change, so deductions even out across remaining months.",
            "Quarterly TDS returns and Form 16 issuance are statutory obligations of the employer.",
          ]}
        />
      </Section>

      <Section title="Keeping rates current">
        <p>
          We update statutory rates, slabs and ceilings in the platform when the
          government revises them, and announce material changes in-product. Because
          a revision can take effect mid-period, we recommend reviewing the first
          payroll run after any announced change before you approve it.
        </p>
      </Section>

      <Section title="Records and retention">
        <p>
          Indian tax and labour law requires employers to preserve payroll and
          statutory records for a number of years. HR Clouds retains those records for
          the statutory period even after a subscription ends, and they remain
          exportable during your wind-down period.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          For questions about how a particular calculation works in the platform,
          write to{" "}
          <a href={`mailto:${COMPANY.supportEmail}`} className="text-purple-600 font-medium hover:underline">
            {COMPANY.supportEmail}
          </a>
          . For whether a rule applies to your organization, speak to your CA.
        </p>
      </Section>
    </LegalPage>
  );
}

export default StatutoryGuidelines;
