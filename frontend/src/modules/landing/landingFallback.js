/**
 * What the marketing site renders before the CMS responds, and if it never
 * does. Mirrors Backend/src/modules/taxi/admin/data/defaultLandingContent.js —
 * keep the two in step when adding a section.
 *
 * Icons are lucide component *names* here, matching the API's wire format;
 * useLandingContent resolves them to components.
 */
export const LANDING_FALLBACK = {
  services: [
    { id: 'auto', title: 'Auto Ride', icon: 'Bike', desc: 'Quick, metered short-distance autos' },
    { id: 'city', title: 'City Ride', icon: 'Car', desc: 'Local hourly & point-to-point rides' },
    { id: 'airport', title: 'Airport Transfer', icon: 'Plane', desc: 'On-time pickup & drop guaranteed' },
    { id: 'outstation', title: 'Outstation', icon: 'Compass', desc: 'Intercity one-way & roundtrips' },
    { id: 'sedan', title: 'Premium Sedan', icon: 'Car', desc: 'Comfortable Dzire & Etios sedans' },
    { id: 'suv', title: 'SUV', icon: 'Car', desc: 'Spacious Ertiga & Innova Crysta' },
    { id: 'corporate', title: 'Corporate Travel', icon: 'Briefcase', desc: 'B2B billing & employee cabs' },
    { id: 'hotel', title: 'Hotel Pickup', icon: 'Building2', desc: 'Luxury airport to hotel transfers' },
    { id: 'mall', title: 'Mall Pickup', icon: 'ShoppingBag', desc: 'Convenient shopping luggage rides' },
  ],

  valueProps: [
    { icon: 'Headphones', title: 'Dedicated Ride Coordinator', desc: 'Our team stays connected with you, every step.' },
    { icon: 'ShieldCheck', title: 'Verified & Trained Drivers', desc: 'Professional drivers for your safe journey.' },
    { icon: 'Navigation', title: 'Live Tracking & Safety', desc: 'Real-time tracking and SOS button for safety.' },
    { icon: 'Wallet', title: 'Transparent Pricing', desc: 'No hidden charges, what you see is what you pay.' },
    { icon: 'PhoneCall', title: '24x7 Customer Support', desc: 'Call, WhatsApp or Chat - we are always here.' },
  ],

  drivers: [
    {
      name: 'Ramesh Kumar', photo: '/drivers/driver-1.jpg', rating: 4.9, trips: '3,200+ trips',
      experience: '8 years experience', vehicle: 'Maruti Suzuki Dzire · KA 01 AB 1234',
      badge: 'Top Driver', city: 'Bengaluru',
    },
    {
      name: 'Suresh Naik', photo: '/drivers/driver-2.jpg', rating: 4.8, trips: '2,100+ trips',
      experience: '6 years experience', vehicle: 'Toyota Innova Crysta · KA 19 CD 5678',
      badge: 'Verified', city: 'Mangaluru',
    },
    {
      name: 'Mahesh Patil', photo: '/drivers/driver-3.jpg', rating: 5.0, trips: '1,450+ trips',
      experience: '5 years experience', vehicle: 'Maruti Suzuki Ertiga · KA 25 EF 9012',
      badge: 'Top Driver', city: 'Hubballi',
    },
    {
      name: 'Imran Shaikh', photo: '/drivers/driver-4.jpg', rating: 4.9, trips: '2,800+ trips',
      experience: '10 years experience', vehicle: 'Toyota Fortuner · KA 03 GH 3456',
      badge: 'Verified', city: 'Bengaluru',
    },
  ],

  partners: [
    { name: 'TAJ Hotels', subtitle: 'HOTELS' },
    { name: 'THE LEELA', subtitle: 'PALACES HOTELS RESORTS' },
    { name: 'NOVOTEL', subtitle: 'HOTELS & RESORTS' },
    { name: 'HYATT REGENCY', subtitle: '' },
    { name: 'LuLu MALL', subtitle: 'World of Happiness' },
    { name: 'Kempegowda Int. Airport', subtitle: 'BENGALURU' },
  ],

  launchCities: [
    { name: 'Bengaluru', note: 'Head Office & Launch City' },
    { name: 'Mangaluru', note: 'Coastal Karnataka Operations' },
    { name: 'Hubballi', note: 'North Karnataka Operations' },
  ],

  contact: {
    email: 'support@zicab.in',
    whatsapp: '919876500000',
    whatsappDisplay: '+91 98765 00000',
    tollFree: '1800 200 9999',
    tollFreeLive: false,
    address: 'Grand Majestic Mall, Gandhinagar, Bengaluru, Karnataka 560009',
    addressShort: 'Grand Majestic Mall, Gandhinagar, Bengaluru',
    mapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Grand+Majestic+Mall+Gandhinagar+Bengaluru',
  },
};
