/**
 * Seed a ZI Bus AC sleeper running Indore -> Delhi, with a Delhi -> Indore
 * return run, real boarding/drop points and two daily departures.
 *
 * Goes through the admin bus service (same validation as the admin panel).
 * Idempotent: matches on serviceNumber, so re-running updates the bus instead
 * of duplicating it, and keeps any driver/conductor assigned since.
 *
 *   node scripts/seedIndoreDelhiBus.js
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { createBusService, updateBusService } from '../src/modules/taxi/admin/services/adminService.js';

const SERVICE_NUMBER = 'ZB-IND-DEL-01';

// 2+1 sleeper, 6 rows per deck -> 36 berths (matches the admin "Sleeper 2+1" template).
const deck = (code) =>
  Array.from({ length: 6 }, (_, index) => {
    const row = index + 1;
    const berth = (seatCode) => ({
      kind: 'seat',
      id: `${code}${row}${seatCode}`,
      label: `${row}${seatCode}`,
      variant: 'sleeper',
      status: 'available',
    });
    return [berth('LA'), berth('LB'), { kind: 'aisle' }, berth('RC')];
  });

const stop = (id, city, pointName, stopType, arrivalTime, departureTime, lat, lng) => ({
  id, city, pointName, stopType, arrivalTime, departureTime, coords: { lat, lng },
});

// Indore -> Dewas -> Shajapur -> Guna -> Gwalior -> Agra -> Delhi (AB Road / NH46 / NH44).
// Times are for the 17:30 departure; the admin panel recalculates them from Google Maps.
const outboundStops = [
  stop('ind-vijaynagar', 'Indore', 'Vijay Nagar Square', 'pickup', '17:30', '17:30', 22.7533, 75.8937),
  stop('ind-sarwate', 'Indore', 'Sarwate Bus Stand', 'pickup', '17:50', '17:55', 22.7146, 75.8686),
  stop('dws-bypass', 'Dewas', 'Dewas Bypass, Ujjain Road Square', 'both', '18:40', '18:45', 22.9676, 76.0534),
  stop('shj-busstand', 'Shajapur', 'Shajapur Bus Stand', 'both', '20:00', '20:05', 23.4273, 76.273),
  stop('gun-bypass', 'Guna', 'Guna Bypass', 'both', '23:15', '23:30', 24.6476, 77.3113),
  stop('gwl-golakamandir', 'Gwalior', 'Gola Ka Mandir', 'both', '02:45', '02:55', 26.2296, 78.212),
  stop('agr-bhagwan', 'Agra', 'Bhagwan Talkies Crossing', 'drop', '05:00', '05:00', 27.2044, 78.0052),
  stop('del-saraikalekhan', 'Delhi', 'Sarai Kale Khan ISBT', 'drop', '08:15', '08:15', 28.5888, 77.256),
  stop('del-kashmeregate', 'Delhi', 'Kashmere Gate ISBT', 'drop', '08:45', '08:45', 28.6675, 77.228),
];

// Same points reversed, pickup/drop roles swapped, timed for the 18:00 Delhi departure.
const returnTimes = {
  'del-kashmeregate': ['18:00', '18:00'],
  'del-saraikalekhan': ['18:35', '18:40'],
  'agr-bhagwan': ['21:50', '21:55'],
  'gwl-golakamandir': ['00:05', '00:15'],
  'gun-bypass': ['03:30', '03:45'],
  'shj-busstand': ['06:50', '06:55'],
  'dws-bypass': ['08:10', '08:15'],
  'ind-sarwate': ['08:55', '08:55'],
  'ind-vijaynagar': ['09:15', '09:15'],
};
const swapType = { pickup: 'drop', drop: 'pickup', both: 'both' };
const returnStops = outboundStops
  .slice()
  .reverse()
  .map((item) => ({
    ...item,
    id: `ret-${item.id}`,
    stopType: swapType[item.stopType],
    arrivalTime: returnTimes[item.id][0],
    departureTime: returnTimes[item.id][1],
  }));

const INDORE = { lat: 22.7196, lng: 75.8577 };
const DELHI = { lat: 28.6139, lng: 77.209 };
const EVERY_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const BUS = {
  operatorName: 'ZI Bus Express',
  busName: 'Indore - Delhi Sleeper Express',
  serviceNumber: SERVICE_NUMBER,
  registrationNumber: 'MP09ZB1001',
  coachType: 'AC Sleeper',
  busCategory: 'Sleeper',
  busColor: '#1f2937',
  seatPrice: 1499,
  variantPricing: { seat: 1499, window: 1499, aisle: 1499, sleeper: 1499 },
  serviceTaxPercentage: 5,
  adminCommissionPercentage: 10,
  fareCurrency: 'INR',
  amenities: ['Charging Port', 'Reading Light', 'Live Tracking', 'Blanket', 'Water Bottle', 'CCTV', 'Emergency Exit'],
  boardingPolicy: 'Reach the boarding point 15 minutes before departure. Carry a valid photo ID.',
  cancellationPolicy: 'Free cancellation up to 24 hours before departure; partial refund up to 6 hours before.',
  cancellationRules: [
    { id: 'cancel-24h', label: '24h+ before departure', hoursBeforeDeparture: 24, refundType: 'percentage', refundValue: 90, notes: '' },
    { id: 'cancel-12h', label: '12-24h before departure', hoursBeforeDeparture: 12, refundType: 'percentage', refundValue: 75, notes: '' },
    { id: 'cancel-6h', label: '6-12h before departure', hoursBeforeDeparture: 6, refundType: 'percentage', refundValue: 50, notes: '' },
    { id: 'cancel-0h', label: 'Under 6h', hoursBeforeDeparture: 0, refundType: 'none', refundValue: 0, notes: 'No refund' },
  ],
  luggagePolicy: 'One cabin bag and one check-in bag (up to 15 kg) per passenger.',
  blueprint: {
    templateKey: 'sleeper_2_1',
    layoutConfig: {
      lower: { enabled: true, rows: 6, leftSeats: 2, rightSeats: 1, seatType: 'sleeper' },
      upper: { enabled: true, rows: 6, leftSeats: 2, rightSeats: 1, seatType: 'sleeper' },
    },
    lowerDeck: deck('L'),
    upperDeck: deck('U'),
  },
  route: {
    routeName: 'Indore to Delhi via Gwalior & Agra',
    originCity: 'Indore',
    destinationCity: 'Delhi',
    originCoords: INDORE,
    destinationCoords: DELHI,
    distanceKm: '830 km',
    durationHours: '15h 15m',
    autoTimings: true,
    stops: outboundStops,
  },
  returnRouteEnabled: true,
  returnRoute: {
    routeName: 'Return: Delhi to Indore',
    originCity: 'Delhi',
    destinationCity: 'Indore',
    originCoords: DELHI,
    destinationCoords: INDORE,
    distanceKm: '830 km',
    durationHours: '15h 15m',
    autoTimings: true,
    stops: returnStops,
  },
  extraRoutes: [],
  schedules: [
    { id: 'ind-del-1730', label: 'Indore → Delhi Evening', departureTime: '17:30', arrivalTime: '08:45', activeDays: EVERY_DAY, status: 'active', routeKey: 'main' },
    { id: 'ind-del-2000', label: 'Indore → Delhi Night', departureTime: '20:00', arrivalTime: '11:15', activeDays: EVERY_DAY, status: 'active', routeKey: 'main' },
    { id: 'del-ind-1800', label: 'Delhi → Indore Evening', departureTime: '18:00', arrivalTime: '09:15', activeDays: EVERY_DAY, status: 'active', routeKey: 'return' },
  ],
  status: 'active',
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || env.mongoUri, { dbName: env.mongoDbName });

  const existing = await BusService.findOne({ serviceNumber: SERVICE_NUMBER }).lean();
  const saved = existing
    ? await updateBusService(String(existing._id), {
        ...BUS,
        // Keep a driver/conductor the admin assigned after the first seed.
        driverName: existing.driverName || '',
        driverPhone: existing.driverPhone || '',
      })
    : await createBusService(BUS);

  console.log(JSON.stringify({
    action: existing ? 'updated' : 'created',
    id: saved.id,
    bus: saved.busName,
    route: `${saved.route.originCity} -> ${saved.route.destinationCity}`,
    returnRoute: saved.returnRouteEnabled ? `${saved.returnRoute.originCity} -> ${saved.returnRoute.destinationCity}` : null,
    stops: saved.route.stops.length,
    berths: saved.capacity,
    schedules: saved.schedules.map((item) => `${item.departureTime} ${item.routeKey}`),
  }, null, 1));
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('seed failed:', error.message);
  process.exit(1);
});
