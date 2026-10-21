/**
 * Seed the ZI Bus catalog: AC / non-AC, seater / sleeper / semi-sleeper /
 * Volvo coaches on real central-India routes, each with a return run.
 *
 * Goes through the admin bus service (same validation as the admin panel).
 * Idempotent: buses match on serviceNumber, so re-running updates them in
 * place and keeps any driver/conductor the admin assigned since.
 *
 * Stop times come from each stop's km marker: the coach's average speed,
 * a 5 min halt at pickups and any meal halt listed on the stop. The admin
 * panel recalculates them from Google Maps when a bus is opened.
 *
 *   node scripts/seedZiBuses.js            # every bus
 *   node scripts/seedZiBuses.js ZB-IND-BPL-01 ZB-IND-UJN-01   # just these
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { createBusService, updateBusService } from '../src/modules/taxi/admin/services/adminService.js';

const EVERY_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PICKUP_HALT_MIN = 5;

// Same seat ids/labels/variants the admin panel's layout templates produce.
const LAYOUTS = {
  seater_2_2: { lower: { rows: 11, left: 2, right: 2, type: 'seat' } },
  sleeper_2_1: { lower: { rows: 6, left: 2, right: 1, type: 'sleeper' }, upper: { rows: 6, left: 2, right: 1, type: 'sleeper' } },
  mixed_redbus: { lower: { rows: 8, left: 2, right: 2, type: 'seat' }, upper: { rows: 4, left: 2, right: 1, type: 'sleeper' } },
};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const buildDeck = (code, config) => {
  if (!config) return [];
  const seatCode = (index, side) => (config.type === 'sleeper' ? `${side === 'left' ? 'L' : 'R'}${LETTERS[index]}` : LETTERS[index]);
  return Array.from({ length: config.rows }, (_, rowIndex) => {
    const row = rowIndex + 1;
    const cell = (codeText, variant) => ({ kind: 'seat', id: `${code}${row}${codeText}`, label: `${row}${codeText}`, variant, status: 'available' });
    const cells = [];
    for (let i = 0; i < config.left; i += 1) {
      cells.push(cell(seatCode(i, 'left'), config.type === 'sleeper' ? 'sleeper' : i === 0 ? 'window' : 'aisle'));
    }
    cells.push({ kind: 'aisle' });
    for (let i = 0; i < config.right; i += 1) {
      cells.push(cell(seatCode(config.left + i, 'right'), config.type === 'sleeper' ? 'sleeper' : i === config.right - 1 ? 'window' : 'aisle'));
    }
    return cells;
  });
};

const buildBlueprint = (templateKey) => {
  const layout = LAYOUTS[templateKey];
  const deckConfig = (deck) => (deck
    ? { enabled: true, rows: deck.rows, leftSeats: deck.left, rightSeats: deck.right, seatType: deck.type }
    : { enabled: false, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' });
  return {
    templateKey,
    layoutConfig: { lower: deckConfig(layout.lower), upper: deckConfig(layout.upper) },
    lowerDeck: buildDeck('L', layout.lower),
    upperDeck: buildDeck('U', layout.upper),
  };
};

const toClock = (minutes) => {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const toMinutes = (clock) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};
const toDuration = (minutes) => {
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// points: [id, city, pointName, stopType, km, lat, lng, mealHaltMin?]
// Returns stops timed from `departure` plus the total trip minutes.
const timeStops = (points, departure, speedKmh) => {
  let clock = toMinutes(departure);
  let lastKm = 0;
  let elapsed = 0;
  const stops = points.map(([id, city, pointName, stopType, km, lat, lng, mealHalt = 0]) => {
    const drive = ((km - lastKm) / speedKmh) * 60;
    lastKm = km;
    clock += drive;
    elapsed += drive;
    // The first boarding point leaves at the schedule's departure time.
    const halt = stopType === 'drop' || km === 0 ? 0 : Math.max(PICKUP_HALT_MIN, mealHalt);
    const arrivalTime = toClock(clock);
    clock += halt;
    elapsed += halt;
    return { id, city, pointName, stopType, arrivalTime, departureTime: toClock(clock), coords: { lat, lng } };
  });
  return { stops, minutes: elapsed - (points.at(-1)[3] === 'drop' ? 0 : Math.max(PICKUP_HALT_MIN, points.at(-1)[7] || 0)) };
};

const SWAP = { pickup: 'drop', drop: 'pickup', both: 'both' };
const reversePoints = (points) => {
  const totalKm = points.at(-1)[4];
  return points
    .slice()
    .reverse()
    .map(([id, city, pointName, stopType, km, lat, lng, mealHalt]) => [`ret-${id}`, city, pointName, SWAP[stopType], totalKm - km, lat, lng, mealHalt]);
};

const CANCELLATION_RULES = [
  { id: 'cancel-24h', label: '24h+ before departure', hoursBeforeDeparture: 24, refundType: 'percentage', refundValue: 90, notes: '' },
  { id: 'cancel-12h', label: '12-24h before departure', hoursBeforeDeparture: 12, refundType: 'percentage', refundValue: 75, notes: '' },
  { id: 'cancel-6h', label: '6-12h before departure', hoursBeforeDeparture: 6, refundType: 'percentage', refundValue: 50, notes: '' },
  { id: 'cancel-0h', label: 'Under 6h', hoursBeforeDeparture: 0, refundType: 'none', refundValue: 0, notes: 'No refund' },
];
const AC_AMENITIES = ['Charging Port', 'Reading Light', 'Live Tracking', 'Blanket', 'Water Bottle', 'CCTV', 'Emergency Exit'];
const VOLVO_AMENITIES = [...AC_AMENITIES, 'WiFi'];
const NON_AC_AMENITIES = ['Charging Port', 'Live Tracking', 'CCTV', 'Emergency Exit'];

// Coach presets: layout, speed and fares by seat variant.
const COACHES = {
  acSleeper: { coachType: 'AC Sleeper', busCategory: 'Sleeper', layout: 'sleeper_2_1', speed: 55, amenities: AC_AMENITIES },
  nonAcSleeper: { coachType: 'Non AC Sleeper', busCategory: 'Sleeper', layout: 'sleeper_2_1', speed: 50, amenities: NON_AC_AMENITIES },
  volvoSleeper: { coachType: 'Volvo Multi Axle', busCategory: 'Sleeper', layout: 'sleeper_2_1', speed: 60, amenities: VOLVO_AMENITIES },
  volvoSeater: { coachType: 'Volvo Multi Axle', busCategory: 'Seater', layout: 'seater_2_2', speed: 60, amenities: VOLVO_AMENITIES },
  acSeater: { coachType: 'AC Seater', busCategory: 'Seater', layout: 'seater_2_2', speed: 55, amenities: AC_AMENITIES },
  nonAcSeater: { coachType: 'Non AC Seater', busCategory: 'Seater', layout: 'seater_2_2', speed: 45, amenities: NON_AC_AMENITIES },
  semiSleeper: { coachType: 'Semi Sleeper', busCategory: 'Semi Sleeper', layout: 'mixed_redbus', speed: 55, amenities: AC_AMENITIES },
};

// Shared boarding / drop points: [city, pointName, lat, lng].
const P = {
  indVijayNagar: ['Indore', 'Vijay Nagar Square', 22.7533, 75.8937],
  indSarwate: ['Indore', 'Sarwate Bus Stand', 22.7146, 75.8686],
  indGangwal: ['Indore', 'Gangwal Bus Stand', 22.7155, 75.838],
  indRau: ['Indore', 'Rau Circle', 22.639, 75.8121],
  dewas: ['Dewas', 'Dewas Bypass, Ujjain Road Square', 22.9676, 76.0534],
  ujjainDewasGate: ['Ujjain', 'Dewas Gate Bus Stand', 23.1789, 75.785],
  ujjainNanakheda: ['Ujjain', 'Nanakheda Bus Stand', 23.16, 75.79],
  sanwer: ['Sanwer', 'Sanwer Bus Stand', 22.975, 75.827],
  shajapur: ['Shajapur', 'Shajapur Bus Stand', 23.4273, 76.273],
  guna: ['Guna', 'Guna Bypass', 24.6476, 77.3113],
  gwaliorGola: ['Gwalior', 'Gola Ka Mandir', 26.2296, 78.212],
  morena: ['Morena', 'Morena Bus Stand', 26.4947, 77.994],
  dholpur: ['Dholpur', 'Dholpur Bypass', 26.7025, 77.8934],
  agra: ['Agra', 'Bhagwan Talkies Crossing', 27.2044, 78.0052],
  mathura: ['Mathura', 'Mathura Bypass', 27.4924, 77.6737],
  delSaraiKaleKhan: ['Delhi', 'Sarai Kale Khan ISBT', 28.5888, 77.256],
  delKashmereGate: ['Delhi', 'Kashmere Gate ISBT', 28.6675, 77.228],
  sonkatch: ['Sonkatch', 'Sonkatch Bus Stand', 22.9726, 76.3466],
  ashta: ['Ashta', 'Ashta Bus Stand', 23.0179, 76.7206],
  sehore: ['Sehore', 'Sehore Bus Stand', 23.2032, 77.0844],
  bplLalghati: ['Bhopal', 'Lalghati Square', 23.2869, 77.3685],
  bplIsbt: ['Bhopal', 'ISBT Bhopal', 23.2337, 77.4345],
  bplMisrod: ['Bhopal', 'Misrod', 23.1793, 77.471],
  obedullaganj: ['Obedullaganj', 'Obedullaganj Bus Stand', 22.9993, 77.5847],
  bareli: ['Bareli', 'Bareli Bus Stand', 23.0008, 78.2286],
  narsinghpur: ['Narsinghpur', 'Narsinghpur Bus Stand', 22.9476, 79.1923],
  jbpIsbt: ['Jabalpur', 'ISBT Jabalpur', 23.1815, 79.9264],
  dhamnod: ['Dhamnod', 'Dhamnod Bus Stand', 22.2086, 75.47],
  sendhwa: ['Sendhwa', 'Sendhwa Bus Stand', 21.6847, 75.0951],
  dhule: ['Dhule', 'Dhule Bypass', 20.9042, 74.7749],
  malegaon: ['Malegaon', 'Malegaon Bypass', 20.5579, 74.5089],
  nashik: ['Nashik', 'Dwarka Circle', 19.9946, 73.7928],
  thane: ['Thane', 'Kapurbawdi Junction', 19.214, 72.978],
  mumBorivali: ['Mumbai', 'Borivali National Park', 19.229, 72.857],
  mumDadar: ['Mumbai', 'Dadar TT Circle', 19.0186, 72.8478],
  sangamner: ['Sangamner', 'Sangamner Bus Stand', 19.5678, 74.2115],
  puneWakdewadi: ['Pune', 'Wakdewadi', 18.5308, 73.853],
  puneSwargate: ['Pune', 'Swargate', 18.5018, 73.8636],
  dhar: ['Dhar', 'Dhar Bus Stand', 22.6013, 75.3025],
  jhabua: ['Jhabua', 'Jhabua Bus Stand', 22.7676, 74.5909],
  dahod: ['Dahod', 'Dahod Bus Stand', 22.8379, 74.2531],
  godhra: ['Godhra', 'Godhra Bypass', 22.7788, 73.6143],
  ahdGeetaMandir: ['Ahmedabad', 'Geeta Mandir', 23.012, 72.59],
  ahdPaldi: ['Ahmedabad', 'Paldi Char Rasta', 23.013, 72.56],
  agar: ['Agar', 'Agar Bus Stand', 23.712, 76.015],
  jhalawar: ['Jhalawar', 'Jhalawar Bus Stand', 24.5973, 76.161],
  kota: ['Kota', 'Nayapura Bus Stand', 25.18, 75.855],
  bundi: ['Bundi', 'Bundi Bypass', 25.4305, 75.6499],
  tonk: ['Tonk', 'Tonk Bypass', 26.1666, 75.7885],
  jaiSindhiCamp: ['Jaipur', 'Sindhi Camp', 26.9239, 75.8],
  jaiDurgapura: ['Jaipur', 'Durgapura', 26.851, 75.793],
};
// [pointKey, stopType, km, mealHaltMin?] -> stop tuple used by timeStops.
const route = (rows) => rows.map(([key, stopType, km, mealHalt]) => {
  const [city, pointName, lat, lng] = P[key];
  return [key, city, pointName, stopType, km, lat, lng, mealHalt];
});

const CATALOG = [
  {
    serviceNumber: 'ZB-IND-DEL-01', operatorName: 'ZI Bus Express', busName: 'Indore - Delhi Sleeper Express',
    registrationNumber: 'MP09ZB1001', coach: 'acSleeper', fares: { sleeper: 1499 }, busColor: '#1f2937',
    routeName: 'Indore to Delhi via Gwalior & Agra',
    points: route([
      ['indVijayNagar', 'pickup', 0], ['indSarwate', 'pickup', 8], ['dewas', 'both', 38], ['shajapur', 'both', 105],
      ['guna', 'both', 300, 20], ['gwaliorGola', 'both', 520], ['agra', 'drop', 640], ['delSaraiKaleKhan', 'drop', 820], ['delKashmereGate', 'drop', 832],
    ]),
    departures: ['17:30', '20:00'], returnDepartures: ['18:00'],
  },
  {
    serviceNumber: 'ZB-IND-BPL-01', operatorName: 'ZI Bus Volvo', busName: 'Indore - Bhopal Volvo Shuttle',
    registrationNumber: 'MP09ZB1002', coach: 'volvoSeater', fares: { window: 599, aisle: 549 }, busColor: '#0f766e',
    routeName: 'Indore to Bhopal via Dewas & Sehore',
    points: route([
      ['indVijayNagar', 'pickup', 0], ['dewas', 'both', 38], ['sonkatch', 'both', 72], ['ashta', 'both', 112],
      ['sehore', 'both', 157], ['bplLalghati', 'drop', 187], ['bplIsbt', 'drop', 195],
    ]),
    departures: ['06:00', '10:00', '14:00', '18:00'], returnDepartures: ['07:00', '11:00', '15:00', '19:00'],
  },
  {
    serviceNumber: 'ZB-IND-UJN-01', operatorName: 'ZI Bus Rapid', busName: 'Indore - Ujjain Mahakal Express',
    registrationNumber: 'MP13ZB1003', coach: 'nonAcSeater', fares: { window: 130, aisle: 120 }, busColor: '#b45309',
    routeName: 'Indore to Ujjain via Sanwer',
    points: route([
      ['indSarwate', 'pickup', 0], ['indVijayNagar', 'pickup', 7], ['sanwer', 'both', 30], ['ujjainDewasGate', 'drop', 55], ['ujjainNanakheda', 'drop', 59],
    ]),
    departures: ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
    returnDepartures: ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
  },
  {
    serviceNumber: 'ZB-IND-BOM-01', operatorName: 'ZI Bus Volvo', busName: 'Indore - Mumbai Volvo Sleeper',
    registrationNumber: 'MP09ZB1004', coach: 'volvoSleeper', fares: { sleeper: 1599 }, busColor: '#1e3a8a',
    routeName: 'Indore to Mumbai via Dhule & Nashik',
    points: route([
      ['indVijayNagar', 'pickup', 0], ['indRau', 'pickup', 14], ['dhamnod', 'both', 95], ['sendhwa', 'both', 165],
      ['dhule', 'both', 255, 20], ['nashik', 'both', 410], ['thane', 'drop', 565], ['mumBorivali', 'drop', 580], ['mumDadar', 'drop', 600],
    ]),
    departures: ['19:30', '21:00'], returnDepartures: ['18:30', '20:30'],
  },
  {
    serviceNumber: 'ZB-IND-AMD-01', operatorName: 'ZI Bus Express', busName: 'Indore - Ahmedabad Non-AC Sleeper',
    registrationNumber: 'MP09ZB1005', coach: 'nonAcSleeper', fares: { sleeper: 749 }, busColor: '#7c2d12',
    routeName: 'Indore to Ahmedabad via Dhar & Dahod',
    points: route([
      ['indGangwal', 'pickup', 0], ['dhar', 'both', 62], ['jhabua', 'both', 155], ['dahod', 'both', 200, 20],
      ['godhra', 'both', 275], ['ahdGeetaMandir', 'drop', 395], ['ahdPaldi', 'drop', 400],
    ]),
    departures: ['21:30'], returnDepartures: ['20:30'],
  },
  {
    serviceNumber: 'ZB-IND-JAI-01', operatorName: 'ZI Bus Gold', busName: 'Indore - Jaipur AC Sleeper',
    registrationNumber: 'MP09ZB1006', coach: 'acSleeper', fares: { sleeper: 1199 }, busColor: '#831843',
    routeName: 'Indore to Jaipur via Ujjain & Kota',
    points: route([
      ['indVijayNagar', 'pickup', 0], ['ujjainDewasGate', 'both', 55], ['agar', 'both', 125], ['jhalawar', 'both', 225, 20],
      ['kota', 'both', 310], ['bundi', 'both', 350], ['tonk', 'drop', 450], ['jaiDurgapura', 'drop', 540], ['jaiSindhiCamp', 'drop', 550],
    ]),
    departures: ['18:30'], returnDepartures: ['19:00'],
  },
  {
    serviceNumber: 'ZB-IND-PNQ-01', operatorName: 'ZI Bus Rapid', busName: 'Indore - Pune Non-AC Sleeper',
    registrationNumber: 'MP09ZB1007', coach: 'nonAcSleeper', fares: { sleeper: 899 }, busColor: '#365314',
    routeName: 'Indore to Pune via Dhule & Nashik',
    points: route([
      ['indVijayNagar', 'pickup', 0], ['indRau', 'pickup', 14], ['sendhwa', 'both', 165], ['dhule', 'both', 255, 20],
      ['malegaon', 'both', 305], ['nashik', 'both', 410], ['sangamner', 'both', 480], ['puneWakdewadi', 'drop', 615], ['puneSwargate', 'drop', 622],
    ]),
    departures: ['18:00'], returnDepartures: ['17:30'],
  },
  {
    serviceNumber: 'ZB-BPL-JBP-01', operatorName: 'ZI Bus Gold', busName: 'Bhopal - Jabalpur Semi Sleeper',
    registrationNumber: 'MP04ZB1008', coach: 'semiSleeper', fares: { window: 699, aisle: 649, sleeper: 849 }, busColor: '#4c1d95',
    routeName: 'Bhopal to Jabalpur via Obedullaganj & Narsinghpur',
    points: route([
      ['bplIsbt', 'pickup', 0], ['bplMisrod', 'pickup', 9], ['obedullaganj', 'both', 35], ['bareli', 'both', 120],
      ['narsinghpur', 'both', 215], ['jbpIsbt', 'drop', 330],
    ]),
    departures: ['22:00'], returnDepartures: ['22:30'],
  },
  {
    serviceNumber: 'ZB-GWL-DEL-01', operatorName: 'ZI Bus Express', busName: 'Gwalior - Delhi AC Seater',
    registrationNumber: 'MP07ZB1009', coach: 'acSeater', fares: { window: 649, aisle: 599 }, busColor: '#0c4a6e',
    routeName: 'Gwalior to Delhi via Agra & Mathura',
    points: route([
      ['gwaliorGola', 'pickup', 0], ['morena', 'both', 40], ['dholpur', 'both', 65], ['agra', 'both', 120],
      ['mathura', 'both', 175], ['delSaraiKaleKhan', 'drop', 310], ['delKashmereGate', 'drop', 322],
    ]),
    departures: ['06:30', '23:00'], returnDepartures: ['07:00', '22:30'],
  },
];

const buildBus = (entry) => {
  const coach = COACHES[entry.coach];
  const blueprint = buildBlueprint(coach.layout);
  const totalKm = entry.points.at(-1)[4];
  const outbound = timeStops(entry.points, entry.departures[0], coach.speed);
  const backPoints = reversePoints(entry.points);
  const inbound = timeStops(backPoints, entry.returnDepartures[0], coach.speed);
  const [origin, destination] = [entry.points[0], entry.points.at(-1)];
  const originCoords = { lat: origin[5], lng: origin[6] };
  const destinationCoords = { lat: destination[5], lng: destination[6] };
  const lowestFare = Math.min(...Object.values(entry.fares));
  const schedule = (key, departure, minutes, prefix, label) => ({
    id: `${entry.serviceNumber.toLowerCase()}-${prefix}-${departure.replace(':', '')}`,
    label,
    departureTime: departure,
    arrivalTime: toClock(toMinutes(departure) + minutes),
    activeDays: EVERY_DAY,
    status: 'active',
    routeKey: key,
  });

  return {
    operatorName: entry.operatorName,
    busName: entry.busName,
    serviceNumber: entry.serviceNumber,
    registrationNumber: entry.registrationNumber,
    coachType: coach.coachType,
    busCategory: coach.busCategory,
    busColor: entry.busColor,
    seatPrice: lowestFare,
    variantPricing: {
      seat: entry.fares.aisle ?? entry.fares.window ?? lowestFare,
      window: entry.fares.window ?? lowestFare,
      aisle: entry.fares.aisle ?? lowestFare,
      sleeper: entry.fares.sleeper ?? lowestFare,
    },
    serviceTaxPercentage: 5,
    adminCommissionPercentage: 10,
    fareCurrency: 'INR',
    amenities: coach.amenities,
    boardingPolicy: 'Reach the boarding point 15 minutes before departure. Carry a valid photo ID.',
    cancellationPolicy: 'Free cancellation up to 24 hours before departure; partial refund up to 6 hours before.',
    cancellationRules: CANCELLATION_RULES,
    luggagePolicy: 'One cabin bag and one check-in bag (up to 15 kg) per passenger.',
    blueprint,
    route: {
      routeName: entry.routeName,
      originCity: origin[1],
      destinationCity: destination[1],
      originCoords,
      destinationCoords,
      distanceKm: `${totalKm} km`,
      durationHours: toDuration(outbound.minutes),
      autoTimings: true,
      stops: outbound.stops,
    },
    returnRouteEnabled: true,
    returnRoute: {
      routeName: `Return: ${destination[1]} to ${origin[1]}`,
      originCity: destination[1],
      destinationCity: origin[1],
      originCoords: destinationCoords,
      destinationCoords: originCoords,
      distanceKm: `${totalKm} km`,
      durationHours: toDuration(inbound.minutes),
      autoTimings: true,
      stops: inbound.stops,
    },
    extraRoutes: [],
    schedules: [
      ...entry.departures.map((time) => schedule('main', time, outbound.minutes, 'out', `${origin[1]} → ${destination[1]} ${time}`)),
      ...entry.returnDepartures.map((time) => schedule('return', time, inbound.minutes, 'ret', `${destination[1]} → ${origin[1]} ${time}`)),
    ],
    status: 'active',
  };
};

const run = async () => {
  const only = new Set(process.argv.slice(2));
  const entries = CATALOG.filter((entry) => !only.size || only.has(entry.serviceNumber));
  if (!entries.length) throw new Error(`no catalog bus matches ${[...only].join(', ')}`);

  await mongoose.connect(process.env.MONGODB_URI || env.mongoUri, { dbName: env.mongoDbName });
  const report = [];
  for (const entry of entries) {
    const payload = buildBus(entry);
    const existing = await BusService.findOne({ serviceNumber: entry.serviceNumber }).lean();
    const saved = existing
      ? await updateBusService(String(existing._id), {
          ...payload,
          // Keep a driver/conductor the admin assigned after the first seed.
          driverName: existing.driverName || '',
          driverPhone: existing.driverPhone || '',
        })
      : await createBusService(payload);
    report.push(
      `${existing ? 'updated' : 'created'}  ${entry.serviceNumber.padEnd(14)} ${saved.coachType.padEnd(17)} ` +
      `${saved.route.originCity} <-> ${saved.route.destinationCity} | ${saved.route.distanceKm}, ${saved.route.durationHours} | ` +
      `${saved.capacity} seats | from Rs ${saved.seatPrice} | ${saved.schedules.length} departures/day`,
    );
  }
  console.log(report.join('\n'));
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('seed failed:', error.message);
  process.exit(1);
});
