import { ApiError } from '../../../../utils/ApiError.js';

// Reads one trip's bookings from an operator's reservation system over a
// plain JSON HTTP API, using field names configured per channel. Covers most
// operator software without code: an admin fills in where the booking list,
// booking id, seats and status live in their response.
//
// connector.options:
//   bookingsPath     '/trips/{tripId}/bookings?date={date}'  (required)
//   listPath         'data.bookings'   where the array is ('' = body is the array)
//   refField         'pnr'             the booking's id in their system
//   seatsField       'seats'           array of seat labels, or of objects
//   seatLabelField   'seatNo'          label inside each seat object, if objects
//   statusField      'status'          optional
//   cancelledValues  ['CANCELLED']     statuses meaning "not holding seats"
//   passengerNameField / passengerPhoneField   optional

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const readPath = (value, path) => {
  if (!path) return value;
  return String(path)
    .split('.')
    .reduce((current, key) => (current == null ? undefined : current[key]), value);
};

const fillTemplate = (template, values) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(values[key] ?? ''));

export const genericRestConnector = {
  type: 'generic_rest',
  label: 'Generic JSON API',

  validate(channel) {
    const { baseUrl, options = {} } = channel.connector || {};
    // Plain http only for a mock system on this machine during development.
    const localDev = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(`${baseUrl || ''}/`);
    if (!/^https:\/\//i.test(baseUrl || '') && !localDev) {
      throw new ApiError(400, 'Connector base URL must use https');
    }
    if (!options.bookingsPath || !options.refField || !options.seatsField) {
      throw new ApiError(400, 'Connector needs bookingsPath, refField and seatsField');
    }
  },

  /// Returns [{ externalRef, seatLabels, cancelled, passengerName, passengerPhone }].
  async fetchTripBookings({ channel, mapping, travelDate }) {
    const { baseUrl, authHeader, authValue, options = {} } = channel.connector;
    const url = new URL(
      fillTemplate(options.bookingsPath, { tripId: mapping.externalTripId, date: travelDate }),
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    if (url.origin !== new URL(baseUrl).origin) {
      throw new ApiError(400, 'bookingsPath must stay on the connector base URL');
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(authHeader && authValue ? { [authHeader]: authValue } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url.host}`);
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('Response too large');
    }

    const list = readPath(JSON.parse(text), options.listPath || '');
    if (!Array.isArray(list)) {
      throw new Error(`No booking list at "${options.listPath || '(root)'}"`);
    }

    const cancelledValues = new Set(
      (Array.isArray(options.cancelledValues) ? options.cancelledValues : ['cancelled'])
        .map((value) => String(value).toLowerCase()),
    );

    return list.map((entry) => {
      const rawSeats = readPath(entry, options.seatsField);
      const seats = (Array.isArray(rawSeats) ? rawSeats : String(rawSeats || '').split(','))
        .map((seat) => (options.seatLabelField && seat && typeof seat === 'object' ? readPath(seat, options.seatLabelField) : seat))
        .map((seat) => String(seat ?? '').trim())
        .filter(Boolean);
      const status = options.statusField ? String(readPath(entry, options.statusField) ?? '').toLowerCase() : '';

      return {
        externalRef: String(readPath(entry, options.refField) ?? '').trim(),
        seatLabels: seats,
        cancelled: Boolean(status) && cancelledValues.has(status),
        passengerName: options.passengerNameField ? String(readPath(entry, options.passengerNameField) ?? '') : '',
        passengerPhone: options.passengerPhoneField ? String(readPath(entry, options.passengerPhoneField) ?? '') : '',
      };
    }).filter((booking) => booking.externalRef);
  },
};
