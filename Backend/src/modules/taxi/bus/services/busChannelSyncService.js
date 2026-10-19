import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { getConnector } from '../connectors/index.js';
import { BusChannel } from '../models/BusChannel.js';
import { BusChannelEvent } from '../models/BusChannelEvent.js';
import { findSchedule, flattenBlueprintSeats } from '../utils/busTime.js';
import { cancelChannelBooking, createChannelBooking } from './busChannelService.js';

// Pull-side synchronisation for channels we poll (operator reservation
// software that can't call us). Each cycle reads the channel's bookings for
// every mapped run over the next few days and makes ZI Bus match:
//   - a seat they sold that we don't have  -> locked here as a channel sale
//   - a seat we hold for them they no longer list -> released here
// Each pulled seat is its own channel booking ("<their ref>/<seat>"), so a
// booking that gains or loses seats on their side reconciles seat by seat.
// If they sold a seat ZI Bus had already sold, nothing is overwritten: the
// clash is logged as a double-sale conflict for the operator to resolve.

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const istDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const runsOn = (schedule, travelDate) => {
  const days = Array.isArray(schedule?.activeDays) ? schedule.activeDays : [];
  return !days.length || days.includes(DAY_LABELS[new Date(`${travelDate}T00:00:00Z`).getUTCDay()]);
};

const logEvent = (channel, data) =>
  BusChannelEvent.create({ channelId: channel._id, direction: 'inbound', ...data }).catch(() => {});

const buildSeatResolver = (busService, mapping) => {
  const seats = flattenBlueprintSeats(busService.blueprint);
  const byKey = new Map();
  seats.forEach((seat) => {
    byKey.set(String(seat.id).toLowerCase(), String(seat.id));
    if (seat.label) byKey.set(String(seat.label).toLowerCase(), String(seat.id));
  });
  const explicit = mapping.seatMap || {};
  return (label) => {
    const mapped = explicit[label] ?? explicit[String(label).toLowerCase()];
    return mapped ? String(mapped) : byKey.get(String(label).toLowerCase()) || null;
  };
};

const reconcileTripDate = async ({ channel, connector, mapping, busService, travelDate, summary }) => {
  const external = await connector.fetchTripBookings({ channel, mapping, travelDate });
  const resolveSeat = buildSeatResolver(busService, mapping);

  // seatId -> { ref, passenger } the channel says it has sold.
  const wanted = new Map();
  for (const booking of external) {
    if (booking.cancelled) continue;
    for (const label of booking.seatLabels) {
      const seatId = resolveSeat(label);
      if (!seatId) {
        summary.unknownSeats += 1;
        logEvent(channel, {
          event: 'sync.unknown_seat',
          status: 'rejected',
          busServiceId: busService._id,
          scheduleId: mapping.scheduleId,
          travelDate,
          externalRef: booking.externalRef,
          lastError: `Seat "${label}" is not on this bus; add it to the trip's seat map`,
        });
        continue;
      }
      wanted.set(seatId, booking);
    }
  }

  const held = await BusBooking.find({
    'channel.channelId': channel._id,
    busServiceId: busService._id,
    scheduleId: mapping.scheduleId,
    travelDate,
    status: { $in: ['confirmed', 'pending'] },
  }).lean();

  // Seats we hold for them that they no longer report.
  for (const booking of held) {
    const cancelledSeats = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
    const active = booking.seatIds.filter((seatId) => !cancelledSeats.has(String(seatId)));
    const ref = booking.channel?.externalRef || '';
    const stale = active.filter((seatId) => {
      const want = wanted.get(String(seatId));
      return !want || `${want.externalRef}/${seatId}` !== ref;
    });
    // Only seats this connector created are its to release; bookings the
    // channel pushed through the API are left alone.
    if (stale.length && ref.includes('/')) {
      await cancelChannelBooking(channel, ref, { seatIds: stale, reason: 'No longer sold on channel' });
      summary.released += stale.length;
    }
    active.forEach((seatId) => {
      const want = wanted.get(String(seatId));
      // Already theirs here: either this connector locked it under the same
      // ref, or the channel pushed it through the API itself.
      if (want && (`${want.externalRef}/${seatId}` === ref || !ref.includes('/'))) {
        wanted.delete(String(seatId));
      }
    });
  }

  // Seats they sold that ZI Bus doesn't show as theirs yet.
  for (const [seatId, booking] of wanted) {
    try {
      await createChannelBooking(channel, {
        busServiceId: String(busService._id),
        scheduleId: mapping.scheduleId,
        travelDate,
        seatIds: [seatId],
        externalRef: `${booking.externalRef}/${seatId}`,
        passenger: { name: booking.passengerName, phone: booking.passengerPhone },
      });
      summary.added += 1;
    } catch (error) {
      if (error?.statusCode === 409) {
        summary.conflicts += 1;
        logEvent(channel, {
          event: 'sync.double_sale',
          status: 'rejected',
          busServiceId: busService._id,
          scheduleId: mapping.scheduleId,
          travelDate,
          seatIds: [seatId],
          externalRef: booking.externalRef,
          lastError: `Seat ${seatId} is sold on ZI Bus and also on ${channel.name}`,
        });
      } else {
        throw error;
      }
    }
  }
};

export const reconcileChannel = async (channelOrId) => {
  // An ObjectId has an _id of its own, so look for a field only documents have.
  const channel = channelOrId?.connector ? channelOrId : await BusChannel.findById(channelOrId);
  if (!channel) {
    throw new ApiError(404, 'Channel not found');
  }

  const connector = getConnector(channel.connector?.type);
  if (!connector) {
    throw new ApiError(400, 'This channel has no pull connector; it pushes bookings through the API');
  }
  connector.validate(channel);

  const summary = { trips: 0, added: 0, released: 0, conflicts: 0, unknownSeats: 0, errors: [] };
  const daysAhead = Math.min(30, Math.max(0, Number(channel.connector.daysAhead ?? 7)));

  for (const mapping of channel.tripMappings || []) {
    const busService = await BusService.findById(mapping.busServiceId).select('blueprint schedules status').lean();
    const schedule = findSchedule(busService, mapping.scheduleId);
    if (!busService || !schedule) {
      summary.errors.push(`Mapping ${mapping.externalTripId}: bus or schedule no longer exists`);
      continue;
    }

    for (let day = 0; day <= daysAhead; day += 1) {
      const travelDate = istDate(day);
      if (!runsOn(schedule, travelDate)) continue;
      summary.trips += 1;
      try {
        await reconcileTripDate({ channel, connector, mapping, busService, travelDate, summary });
      } catch (error) {
        summary.errors.push(`${mapping.externalTripId} ${travelDate}: ${error.message}`);
      }
    }
  }

  const status = summary.errors.length
    ? `error: ${summary.errors[0]}`.slice(0, 300)
    : `ok: +${summary.added} -${summary.released}${summary.conflicts ? `, ${summary.conflicts} conflict(s)` : ''}`;
  await BusChannel.updateOne(
    { _id: channel._id },
    { $set: { 'connector.lastPolledAt': new Date(), 'connector.lastPollStatus': status } },
  );
  return summary;
};

/// Runs every due pull connector once. Each channel is claimed by pushing its
/// next poll time forward first, so several backend instances never poll the
/// same channel at the same time.
export const runChannelPullCycle = async () => {
  for (let index = 0; index < 50; index += 1) {
    const now = new Date();
    const claimed = await BusChannel.findOneAndUpdate(
      {
        active: true,
        'connector.type': { $nin: ['push_api', '', null] },
        $or: [{ 'connector.nextPollAt': null }, { 'connector.nextPollAt': { $lte: now } }],
      },
      [
        {
          $set: {
            'connector.nextPollAt': {
              $add: [now, { $multiply: [{ $ifNull: ['$connector.pollSeconds', 120] }, 1000] }],
            },
          },
        },
      ],
      { returnDocument: 'after', updatePipeline: true },
    );
    if (!claimed) break;

    try {
      await reconcileChannel(claimed);
    } catch (error) {
      await BusChannel.updateOne(
        { _id: claimed._id },
        { $set: { 'connector.lastPolledAt': new Date(), 'connector.lastPollStatus': `error: ${error.message}`.slice(0, 300) } },
      );
    }
  }
};

let pullTimer = null;

export const startChannelPullLoop = (intervalMs = 30_000) => {
  if (pullTimer) return;
  pullTimer = setInterval(() => {
    runChannelPullCycle().catch((error) => console.error('[bus-channel] pull cycle failed', error.message));
  }, intervalMs);
  pullTimer.unref?.();
};
