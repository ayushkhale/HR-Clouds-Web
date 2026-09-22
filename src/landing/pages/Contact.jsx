import { Link } from "react-router-dom";
import { HiOutlineMail, HiOutlineOfficeBuilding, HiOutlineSupport } from "react-icons/hi";
import { Reveal, RevealText } from "../../shared/motion";
import { COMPANY, privacyContact, hasEntityDetails } from "../../shared/config/company";

/* Each route into the company, with the address that actually reaches a human.
   Everything resolves to a real mailbox — this page exists partly because the
   footer's "Help Center" used to be a dead `#`. */
const CHANNELS = [
  {
    icon: HiOutlineSupport,
    title: "Product support",
    body: "Trouble with attendance, payroll or documents in your workspace. Include your organization name so we can find the account.",
    action: COMPANY.supportEmail,
  },
  {
    icon: HiOutlineOfficeBuilding,
    title: "Sales & demos",
    body: "Questions about plans, seat limits or moving an existing payroll onto HR Clouds. We'll walk you through it — no pressure.",
    action: COMPANY.supportEmail,
  },
  {
    icon: HiOutlineMail,
    title: "Privacy & data requests",
    body: "Access, correction or erasure of personal data. If you're an employee, start with your own HR team — they control the record.",
    action: privacyContact(),
  },
];

function Contact() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative bg-primary-500 overflow-hidden pt-32 pb-16 sm:pt-36 sm:pb-20">
        <div className="left-[-10%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-10 blur-3xl rounded-[50%] w-[40rem] h-40 -rotate-45 pointer-events-none" />
        <div className="bottom-0 right-[-10%] absolute bg-gradient-to-r from-purple-500/20 to-transparent blur-3xl rounded-[50%] w-[35rem] h-40 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-8">
          <p className="text-purple-200 text-xs font-bold uppercase tracking-widest mb-3">
            Contact
          </p>
          <RevealText
            as="h1"
            text="Talk to us"
            className="font-bold text-3xl sm:text-5xl text-white tracking-tight mb-4"
          />
          <Reveal as="p" delay={160} className="text-white/70 text-base sm:text-lg leading-relaxed max-w-2xl">
            Every message below reaches a person, not a ticket queue that nobody
            reads. Pick whichever fits and we&rsquo;ll come back to you.
          </Reveal>
        </div>
      </section>

      {/* Channels */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {CHANNELS.map(({ icon: Icon, title, body, action }, i) => (
            <Reveal key={title} variant="rise" index={i} className="h-full">
              <div className="h-full flex flex-col rounded-2xl border border-gray-200 p-6 hover:border-purple-300 hover:shadow-lg hover:-translate-y-1 transition-[transform,border-color,box-shadow] duration-300 ease-out motion-reduce:transform-none">
                <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="font-bold text-lg text-primary-800 tracking-tight mb-2">
                  {title}
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed flex-1 mb-5">
                  {body}
                </p>
                <a
                  href={`mailto:${action}`}
                  className="text-sm font-semibold text-purple-700 hover:text-purple-900 break-words transition-colors"
                >
                  {action}
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        {hasEntityDetails() && (
          <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-50/60 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Registered office
            </p>
            <div className="text-sm text-gray-600 space-y-1">
              {COMPANY.legalName && (
                <p className="font-semibold text-primary-800">{COMPANY.legalName}</p>
              )}
              {COMPANY.registeredAddress && <p>{COMPANY.registeredAddress}</p>}
              {COMPANY.cin && <p>CIN: {COMPANY.cin}</p>}
              {COMPANY.gstin && <p>GSTIN: {COMPANY.gstin}</p>}
            </div>
          </div>
        )}

        {/* Self-serve first — most "how do I" questions are answered faster here */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-gray-500 text-sm leading-relaxed">
            Looking for pricing, or what each plan includes? That&rsquo;s all on the{" "}
            <Link to="/pricing" className="text-purple-600 font-medium hover:underline">
              pricing page
            </Link>
            . For how we handle your data, see the{" "}
            <Link to="/legal/privacy" className="text-purple-600 font-medium hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

export default Contact;
