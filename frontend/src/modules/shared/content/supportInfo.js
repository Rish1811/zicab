import useLandingContent from '../../landing/useLandingContent';

/**
 * Support/company details shown on the legal pages and the rider, driver and
 * owner support screens.
 *
 * These used to be a hardcoded block describing a different product entirely —
 * another company's name, owner, Noida address, phone number and an email
 * containing a space — which shipped publicly on /terms and /privacy and inside
 * both apps. They now come from the CMS contact section, so the admin panel is
 * the one place they are set.
 *
 * `ownerName` is deliberately gone: publishing a named individual is not
 * something to guess at, and nothing needs it.
 */

const STATIC_DETAILS = {
  companyName: 'ZI CAB Technologies Pvt Ltd',
  supportLabel: '24x7 customer support',
  responseTime: 'Replies typically within 2 hours',
  serviceArea: 'Taxi rides, parcels, bookings, payments, and account help',
  availability: 'Available every day, all day',
};

const toDialable = (value = '') => String(value).replace(/[^\d+]/g, '');

export function useSupportInfo() {
  const { contact } = useLandingContent();

  const phone = contact?.tollFree || contact?.whatsappDisplay || '';

  return {
    ...STATIC_DETAILS,
    phone,
    // wa/tel links need the punctuation stripped; fall back to the dial-format
    // WhatsApp number when no toll-free line is configured yet.
    phoneHref: toDialable(contact?.tollFree) || contact?.whatsapp || toDialable(phone),
    email: contact?.email || '',
    officeAddress: contact?.address || '',
  };
}
