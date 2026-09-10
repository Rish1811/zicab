import { createContext, useContext, useMemo } from 'react';
import useLandingContent from './useLandingContent';
import { LANDING_FALLBACK } from './landingFallback';

/**
 * Makes the CMS content available to every landing page.
 *
 * Before this, `siteConfig.js` held a second hardcoded copy of the contact
 * details and launch cities that most pages imported directly, so editing them
 * in the admin panel only changed the home page while the footer, contact page
 * and booking modal kept showing the old values. Everything now reads from here,
 * and `useLandingContent` is called once in the shell rather than per page.
 */

const LandingContentContext = createContext(null);

const DEFAULT_WA_MESSAGE = "Hi ZI CAB, I'd like to book a ride.";

const buildValue = (content) => ({
  ...content,
  // wa.me needs digits only with a country code; the display value is separate.
  waLink: (message = DEFAULT_WA_MESSAGE) =>
    `https://wa.me/${content?.contact?.whatsapp || ''}?text=${encodeURIComponent(message)}`,
});

export function LandingContentProvider({ children }) {
  const content = useLandingContent();
  const value = useMemo(() => buildValue(content), [content]);

  return <LandingContentContext.Provider value={value}>{children}</LandingContentContext.Provider>;
}

/**
 * Falls back to the bundled copy when used outside the provider, so a page
 * rendered on its own still shows contact details rather than blanks.
 */
export function useLanding() {
  return useContext(LandingContentContext) || buildValue(LANDING_FALLBACK);
}

/** Convenience for the many components that only need contact details. */
export function useSiteContact() {
  const { contact, waLink } = useLanding();
  return { contact: contact || LANDING_FALLBACK.contact, waLink };
}
