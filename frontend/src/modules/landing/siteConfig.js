// Single source of truth for ZI CAB contact + presence details.
// Change a number/email/address HERE only — every page reads from this file.

export const CONTACT = {
  // TODO(client): confirm the official email address
  email: 'support@zicab.in',

  // TODO(client): replace with the official WhatsApp number.
  // `whatsapp` = digits only with country code (used to build the wa.me link).
  whatsapp: '919876500000',
  whatsappDisplay: '+91 98765 00000',

  // TODO(client): replace once the 1800 series toll-free number is provisioned.
  // Until then this falls back to a normal 10-digit support line.
  tollFree: '1800 200 9999',
  tollFreeLive: false, // set true when the 1800 number is actually active

  address: 'Grand Majestic Mall, Gandhinagar, Bengaluru, Karnataka 560009',
  addressShort: 'Grand Majestic Mall, Gandhinagar, Bengaluru',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Grand+Majestic+Mall+Gandhinagar+Bengaluru',
};

export const waLink = (msg = "Hi ZI CAB, I'd like to book a ride.") =>
  `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(msg)}`;

export const LAUNCH_CITIES = [
  { name: 'Bengaluru', note: 'Head Office & Launch City' },
  { name: 'Mangaluru', note: 'Coastal Karnataka Operations' },
  { name: 'Hubballi', note: 'North Karnataka Operations' },
];
