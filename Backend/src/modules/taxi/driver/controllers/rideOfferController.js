import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { Ride } from '../../user/models/Ride.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { resolveTransportDispatchConfig } from '../../services/transportSettingsService.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { acceptRideAssignment, getRideDetails, getRideRoom, serializeRideRealtime, serializeTollCharges } from '../../services/rideService.js';
import { emitToDriver, markDriverRejectedFromDispatch, notifyRideAccepted } from '../../services/dispatchService.js';
import { estimateDriverEarning } from '../../services/driverEarningEstimate.js';
import { RideBid } from '../../user/models/RideBid.js';

/**
 * Offers this driver was dispatched but has not answered yet.
 *
 * The socket is the primary delivery path, but the server marks a driver as
 * notified at dispatch time and never re-emits `rideRequest` on reconnect — so
 * an offer sent into a dead socket is otherwise lost for good. The driver app
 * polls this after reconnecting and whenever a `ride_request` push lands.
 *
 * The payload deliberately mirrors the socket `rideRequest` event field for
 * field, because the app parses both through the same `RideRequest.fromJson`.
 */

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });

const asIdSet = (values = []) => new Set((values || []).map((value) => String(value)));

export const getPendingRideOffers = asyncHandler(async (req, res) => {
  const driverId = String(req.auth.sub);
  const [dispatchConfig, biddingDispatchConfig] = await Promise.all([
    resolveTransportDispatchConfig(),
    resolveTransportDispatchConfig({ bidding: true }),
  ]);

  // An offer is only worth replaying while its dispatch is still plausibly
  // live. Beyond the whole search window the ride is either taken or about to
  // be closed as unmatched, and surfacing it would put a dead card on screen.
  //
  // This query spans rides of both kinds, so it uses whichever window is
  // longer: cutting at the regular one would hide a bidding ride that is still
  // being searched for when the admin has given bidding more time.
  const longestSearchSeconds = Math.max(
    dispatchConfig.maxSearchSeconds,
    biddingDispatchConfig.maxSearchSeconds,
  );
  const freshestDispatchAt = new Date(Date.now() - longestSearchSeconds * 1000);

  const rides = await Ride.find({
    status: RIDE_STATUS.SEARCHING,
    driverId: null,
    'dispatchTracking.notifiedDriverIds': driverId,
    'dispatchTracking.lastDispatchAttemptAt': { $gte: freshestDispatchAt },
  })
    .sort({ 'dispatchTracking.lastDispatchAttemptAt': -1 })
    .limit(5)
    .populate('userId', 'name phone countryCode')
    .lean();

  // Batched once for the whole page rather than per ride — mirrors the
  // socket dispatch path's own single lookup per wave, and these rides can
  // repeat the same vehicle type across several of them.
  const vehicleTypeIds = [...new Set(rides.map((r) => r.vehicleTypeId).filter(Boolean).map(String))];
  const vehicles = vehicleTypeIds.length
    ? await Vehicle.find({ _id: { $in: vehicleTypeIds } }).select('name').lean()
    : [];
  const vehicleNameById = new Map(vehicles.map((v) => [String(v._id), v.name || '']));

  // A ride this driver already bid on is waiting on the rider, not on them.
  // Replaying it put the same offer back on screen 5 s after 'Keep driving'.
  const biddedRideIds = rides.length
    ? new Set((await RideBid.find({ rideId: { $in: rides.map((r) => r._id) }, driverId }).distinct('rideId')).map(String))
    : new Set();

  const offers = rides
    .filter((ride) => !asIdSet(ride?.dispatchTracking?.rejectedDriverIds).has(driverId))
    .filter((ride) => !biddedRideIds.has(String(ride._id)))
    .map((ride) => {
      const rider = ride.userId && typeof ride.userId === 'object' ? ride.userId : {};
      const lastDispatchAt = ride?.dispatchTracking?.lastDispatchAttemptAt
        ? new Date(ride.dispatchTracking.lastDispatchAttemptAt)
        : null;

      // How long the card should still count down for. Derived from when the
      // offer actually went out, so a driver who reconnects ten seconds late
      // sees five seconds left rather than a fresh full timer.
      const elapsedSeconds = lastDispatchAt
        ? Math.max(0, Math.round((Date.now() - lastDispatchAt.getTime()) / 1000))
        : 0;
      // A ride being bid on is offered on the admin's bidding clock, so the
      // card has to count down on the same one or it expires early.
      const rideDispatchConfig = ride.pricingNegotiationMode === 'driver_bid'
        ? biddingDispatchConfig
        : dispatchConfig;
      const expiresInSeconds = Math.max(
        1,
        rideDispatchConfig.retryWindowSeconds - elapsedSeconds,
      );

      return {
        rideId: String(ride._id),
        type: ride.serviceType || 'ride',
        serviceType: ride.serviceType || 'ride',
        userId: String(rider._id || ride.userId || ''),
        user: {
          id: String(rider._id || ride.userId || ''),
          name: rider.name || 'Customer',
          phone: rider.phone || '',
          countryCode: rider.countryCode || '',
        },
        pickupLocation: ride.pickupLocation,
        pickupAddress: ride.pickupAddress || '',
        dropLocation: ride.dropLocation,
        dropAddress: ride.dropAddress || '',
        stops: ride.stops || [],
        scheduledAt: ride.scheduledAt || null,
        estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
        estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
        vehicleTypeId: ride.vehicleTypeId ? String(ride.vehicleTypeId) : null,
        vehicleTypeIds: (ride.dispatchVehicleTypeIds || []).map(String),
        vehicleLabel: vehicleNameById.get(String(ride.vehicleTypeId || '')) || '',
        vehicleIconType: ride.vehicleIconType || '',
        vehicleIconUrl: ride.vehicleIconUrl || '',
        fare: ride.fare,
        baseFare: Number(ride.baseFare || ride.fare || 0),
        surgeMultiplier: Number(ride.surge?.multiplier || 1),
        tollCharges: serializeTollCharges(ride.tollCharges),
        ...estimateDriverEarning(ride),
        bookingMode: ride.bookingMode || 'normal',
        pricingNegotiationMode: ride.pricingNegotiationMode || 'none',
        biddingStatus: ride.biddingStatus || 'none',
        // The full range, as the live offer sends it. A recovered bidding offer
        // had only the flag, so its ceiling came out as 0.
        bidding: ride.pricingNegotiationMode === 'driver_bid'
          ? {
              enabled: true,
              baseFare: Number(ride.baseFare || ride.fare || 0),
              bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
              userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
              bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
              bidStepAmount: Number(ride.bidStepAmount || 10),
            }
          : { enabled: false },
        bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
        userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
        bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
        bidStepAmount: Number(ride.bidStepAmount || 10),
        paymentMethod: ride.paymentMethod,
        parcel: ride.parcel || null,
        intercity: ride.intercity || null,
        maxAttempts: rideDispatchConfig.maxAttempts,
        acceptRejectDurationSeconds: rideDispatchConfig.retryWindowSeconds,
        expiresInSeconds,
        requestExpiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };
    });

  // Keyed `offers` to match what the driver app reads.
  ok(res, { offers });
});

/// Accept or turn down an offer over plain HTTP - the lock-screen card's
/// buttons, which run in native code with no socket. The app has always POSTed
/// here and the route did not exist, so Accept on the lock screen did nothing.
///
/// POST /drivers/ride-offers/:rideId/accept | /reject
export const answerRideOffer = asyncHandler(async (req, res) => {
  const driverId = String(req.auth.sub);
  const { rideId, action } = req.params;

  if (action === 'reject') {
    await markDriverRejectedFromDispatch(rideId, driverId);
    res.json({ success: true, data: { rideId: String(rideId), action: 'reject' } });
    return;
  }

  if (action !== 'accept') {
    throw new ApiError(400, 'action must be accept or reject');
  }

  // Same path as the socket accept: first successful transaction wins.
  const ride = await acceptRideAssignment({ rideId, driverId });
  await notifyRideAccepted(ride);
  const fullRide = await getRideDetails(ride._id).catch(() => null);
  const payload = fullRide ? serializeRideRealtime(fullRide) : {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
    acceptedAt: ride.acceptedAt,
  };
  // If the app is open (or opens next), it adopts the ride from these.
  emitToDriver(driverId, 'rideAccepted', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
    acceptedAt: ride.acceptedAt,
  });
  emitToDriver(driverId, 'ride:state', payload);

  res.json({ success: true, data: payload });
});
