/**
 * Seed content for the marketing site.
 *
 * These are the values the landing pages were hardcoded with, lifted verbatim so
 * switching them to CMS-driven changes nothing visually. Editing them in the
 * admin panel is what makes them differ from here.
 *
 * `icon` holds a lucide-react component name; the client maps it back to a
 * component, falling back to a neutral icon for anything it does not know.
 */
export const defaultLandingContent = {
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

  // TODO(client): replace with real driver photos + details from onboarding.
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

  // Logo, wordmark and app-store links. The store badges were non-clickable
  // placeholders and the QR code was an icon, so these start empty and the
  // client fills them in.
  brand: {
    logo: '/zicab-logo.jpg',
    wordmarkPrimary: 'ZI',
    wordmarkSecondary: 'CAB',
    tagline: 'Your Ride. Our Priority.',
    appBlurb: 'Book rides in seconds, track drivers live, and manage invoices with the ZI CAB app.',
    playStoreUrl: '',
    appStoreUrl: '',
    playStoreQr: '',
    appStoreQr: '',
  },

  hero: {
    titleLine1: 'Your Ride.',
    titleLine2: 'Our Priority.',
    subtitle: 'Premium rides, verified drivers and 24x7 support with our dedicated ride coordinators.',
    primaryCta: 'Book a Ride',
    secondaryCta: 'Download App',
    badges: [
      { icon: 'ShieldCheck', label: 'Verified Drivers' },
      { icon: 'Navigation', label: 'Live Tracking' },
      { icon: 'Headphones', label: '24x7 Support' },
      { icon: 'Wallet', label: 'Secure Payments' },
    ],
  },

  footer: {
    description:
      'ZI CAB is a premium cab booking platform providing safe, transparent, and 24x7 verified rides — now live in Bengaluru, Mangaluru and Hubballi.',
    servicesHeading: 'Cab Services',
    cabServices: [
      { label: 'City Ride (Local Cabs)' },
      { label: 'Airport Pickup & Drop' },
      { label: 'Outstation One-Way & Roundtrip' },
      { label: 'Premium Executive Sedans' },
      { label: 'SUV & Innova Crysta' },
      { label: 'Hotel & Mall Pickup' },
    ],
    trustPills: [
      { label: 'Verified Drivers' },
      { label: '24x7 Live SOS' },
    ],
    copyright: '© 2026 ZI CAB Technologies Pvt Ltd. All Rights Reserved.',
  },

  seo: {
    title: 'ZI CAB - Your Ride. Our Priority.',
    description:
      'ZI CAB - city, outstation and airport cabs with verified drivers and 24x7 support. Now live in Bengaluru, Mangaluru and Hubballi.',
  },

  about: {
    tag: 'About ZI CAB',
    title: 'Redefining Premium Cab Services Across Karnataka',
    subtitle:
      'Built on trust, safety, and reliability. Seamless city, outstation and airport rides — now live in Bengaluru, Mangaluru and Hubballi.',
    stats: [
      { label: 'Successful Rides', count: 100000, suffix: '+' },
      { label: 'Customer Rating', value: '4.9 ★' },
      { label: 'Launch Cities', count: 3 },
      { label: 'Verified Drivers', count: 500, suffix: '+' },
    ],
    foundersTag: 'Leadership',
    foundersHeading: 'Meet the Founders',
    // Placeholders until the client supplies real details and photos.
    founders: [
      { name: 'Founder Name', role: 'Founder & CEO', photo: '', bio: '', linkedin: '' },
      { name: 'Co-Founder Name', role: 'Co-Founder & COO', photo: '', bio: '', linkedin: '' },
    ],
    pillarsHeading: 'The Pillars of ZI CAB',
    pillars: [
      { icon: 'ShieldCheck', title: 'Safety First', desc: 'All vehicles are equipped with real-time GPS tracking, dual dash cams, and SOS emergency buttons monitored 24x7 by our command center.' },
      { icon: 'Award', title: 'Transparent Pricing', desc: 'Zero surge pricing surprises. What you see during booking is exact fare you pay—inclusive of fuel, toll, and taxes.' },
      { icon: 'HeartHandshake', title: 'Dedicated Ride Coordinator', desc: 'Every ride is actively monitored by a personal ride coordinator to handle unexpected delays, rerouting, or flight changes.' },
      { icon: 'Users', title: 'Professional Fleet', desc: 'Strict driver background verification, police verification, and quarterly vehicle maintenance checks guarantee a smooth journey.' },
    ],
  },

  faqs: [
    { q: 'Does ZI CAB apply surge pricing?', a: 'No. The fare shown at booking is the fare you pay, inclusive of fuel, toll and taxes.' },
    { q: 'What is the cancellation policy?', a: 'Cancellations made within the free window carry no charge. After that, the applicable cancellation fee is shown before you confirm.' },
    { q: 'How do airport pickups work?', a: 'Your driver tracks the flight and waits in the designated pickup area. Free waiting time applies from the time of landing.' },
    { q: 'Which payment methods are accepted?', a: 'Cash to driver, Google Pay, PhonePe, Paytm, credit and debit cards, and net banking.' },
    { q: 'How are drivers verified?', a: 'Every driver passes document checks and police verification before their first ride, and is rated by riders thereafter.' },
  ],

  servicesPage: {
    tag: 'ZI CAB Offerings',
    title: 'Comprehensive Mobility Services',
    subtitle:
      'Whether for daily city commute, airport runs, or outstation family road trips, we have the ideal vehicle and service for you.',
    ctaLabel: 'Book This Service',
    items: [
      { id: 'auto', title: 'Auto Ride', tag: 'Short Distance & Metered', icon: 'Bike', image: '/vehicles/auto.jpg',
        description: 'The quickest way across town for short hops — metered auto rickshaws with verified drivers and no haggling over fare.',
        features: ['Lowest fare per km', 'Ideal for 1-5 km trips', 'Beats peak-hour traffic', '3 passenger seating'] },
      { id: 'city', title: 'City Ride (Local Cabs)', tag: 'Point-to-Point & Hourly', icon: 'Car', image: '/vehicles/dzire.jpg',
        description: 'Hassle-free daily city travel with instant driver allocation, clean sedans, and transparent fixed fare per km.',
        features: ['Zero surge pricing', '4hr, 8hr, 12hr package rentals', 'Instant driver tracking', 'AC always enabled'] },
      { id: 'airport', title: 'Airport Transfer', tag: 'Pickup & Drop Guarantee', icon: 'Plane',
        image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=80',
        description: 'Never miss a flight again. Punctual 24x7 pickups from your doorstep directly to airport terminals with flight tracking.',
        features: ['60 mins free waiting time at airport', 'Flight delay tracking', 'Luggage assistance', 'Toll taxes included'] },
      { id: 'outstation', title: 'Outstation Travel', tag: 'One-Way & Round Trips', icon: 'Compass', image: '/vehicles/ertiga.jpg',
        description: 'Comfortable long-distance travel between cities. Pay only for one-way drop or book a round trip for weekend getaways.',
        features: ['Experienced highway drivers', 'No hidden driver allowance fees', 'Night charge free', 'All India Tourist Permit'] },
      { id: 'sedan', title: 'Premium Sedan', tag: 'Comfort & Style', icon: 'Car', image: '/vehicles/dzire.jpg',
        description: 'Elegant Dzire, Etios, and Honda Amaze sedans featuring spacious legroom and premium upholstery.',
        features: ['4 Passenger seating', '2 Large Suitcase capacity', 'Water bottles & chargers', 'Smooth quiet ride'] },
      { id: 'suv', title: 'SUV & Innova Crysta', tag: 'Group & Family Travel', icon: 'Car', image: '/vehicles/innova-crysta.jpg',
        description: 'Luxury MUVs and SUVs designed for family vacations, wedding delegates, and heavy luggage travel.',
        features: ['6 to 7 Seats capacity', 'Rear AC vents', 'Ample luggage space', 'Reclining leather seats'] },
      { id: 'corporate', title: 'Corporate Travel', tag: 'B2B Mobility Solutions', icon: 'Briefcase',
        image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=700&q=80',
        description: 'Tailored executive travel for business travelers, client hospitality, and monthly corporate employee commutes.',
        features: ['Centralized monthly invoicing', 'GST compliant bills', 'Dedicated Account Manager', 'Priority cab dispatch'] },
      { id: 'hotel', title: 'Hotel Pickup & Transfers', tag: 'Hospitality Partner Cabs', icon: 'Building2',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80',
        description: 'Seamless transfers between luxury hotels, convention centers, and tourist landmarks with chauffeur protocol.',
        features: ['Chauffeur uniform protocol', 'Punctual lobby pickup', 'Multi-stop city tours', 'VIP guest welcome'] },
      { id: 'mall', title: 'Mall Pickup & Shopping Rides', tag: 'Convenient & Easy', icon: 'ShoppingBag',
        image: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=700&q=80',
        description: 'Avoid parking hassles at busy shopping centers. Call a cab right to the mall exit gate after your shopping trip.',
        features: ['Dedicated pickup bay guidance', 'Luggage loading assistance', 'Quick response time', 'Clean trunk space'] },
    ],
  },
};
