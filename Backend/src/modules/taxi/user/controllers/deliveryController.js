import { createDeliveryRecord, getActiveDeliveryForIdentity, getDeliveryById, listDeliveriesForIdentity, quoteDeliveryFare } from '../services/deliveryService.js';

/// Fare for a parcel before it is booked, so the address screen can show the
/// rider a price to agree to instead of failing to calculate one.
export const quoteDelivery = async (req, res) => {
  const { vehicleTypeId, pickup, drop } = req.body;
  const quote = await quoteDeliveryFare({ vehicleTypeId, pickup, drop });
  res.json({ success: true, data: quote });
};

export const createDelivery = async (req, res) => {
  const { pickup, drop, pickupAddress, dropAddress, fare, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, parcel } = req.body;

  const delivery = await createDeliveryRecord({
    userId: req.auth.sub,
    pickup,
    drop,
    pickupAddress,
    dropAddress,
    fare,
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    parcel,
  });

  res.status(201).json({
    success: true,
    data: delivery,
  });
};

export const getMyActiveDelivery = async (req, res) => {
  const delivery = await getActiveDeliveryForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json({
    success: true,
    data: delivery,
  });
};

export const getDelivery = async (req, res) => {
  const delivery = await getDeliveryById({
    deliveryId: req.params.deliveryId,
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.json({
    success: true,
    data: delivery,
  });
};

export const listMyDeliveries = async (req, res) => {
  const deliveries = await listDeliveriesForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
    limit: req.query.limit,
  });

  res.json({
    success: true,
    data: {
      results: deliveries,
      total: deliveries.length,
    },
  });
};
