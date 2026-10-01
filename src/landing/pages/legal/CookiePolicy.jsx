import LegalPage, { Section, Bullets } from "./LegalPage";
import { privacyContact } from "../../../shared/config/company";

function CookiePolicy() {
  return (
    <LegalPage
      title="Cookie Policy"
      summary="What HR Clouds stores in your browser, and why. The short version: only what the product needs to work — no advertising or cross-site tracking."
    >
      <Section title="What we store">
        <p>
          HR Clouds keeps a small amount of data in your browser using cookies and
          local storage. Each item falls into one of two groups.
        </p>
        <Bullets
          items={[
            <>
              <strong>Strictly necessary.</strong> Your session token, which keeps you
              signed in and is cleared when you sign out; and the organization you
              selected, where your account belongs to more than one. Without these you
              cannot use the product, so they are set without asking.
            </>,
            <>
              <strong>Preferences.</strong> Small choices the interface remembers so it
              behaves the same next visit — for example whether you have dismissed the
              Maya assistant. These are convenience only, and clearing them simply
              resets the interface to its defaults.
            </>,
          ]}
        />
      </Section>

      <Section title="What we do not do">
        <Bullets
          items={[
            "We set no advertising cookies and run no ad networks.",
            "We do not track you across other websites.",
            "We do not sell or share browser data with data brokers.",
          ]}
        />
      </Section>

      <Section title="Third parties">
        <p>
          Two third parties may set their own storage when you use specific features:
          Razorpay during subscription checkout, and Google when you choose to sign in
          with a Google account. Each acts under its own privacy and cookie policy for
          that interaction.
        </p>
      </Section>

      <Section title="Managing it">
        <p>
          You can clear cookies and site data from your browser settings at any time.
          Clearing the strictly necessary items signs you out; clearing preferences
          resets the interface. Blocking all cookies for this site will prevent
          sign-in from working.
        </p>
        <p>
          Questions about any of this can go to{" "}
          <a href={`mailto:${privacyContact()}`} className="text-purple-600 font-medium hover:underline">
            {privacyContact()}
          </a>.
        </p>
      </Section>
    </LegalPage>
  );
}

export default CookiePolicy;
