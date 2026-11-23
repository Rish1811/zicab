/// What a driver will be paid for a ride, worked out the way settlement
/// (driver/services/walletService.js settleCompletedRideWallet) pays it.
///
/// The offer card used to show `fare`: what the rider pays, after cashback and
/// coupon (which ZI CAB covers), and still holding commission and the rider's
/// platform fee. A driver could turn down a ride that paid more than it
/// showed, or accept one that paid less. A daily pass waives the commission;
/// that is not known here, so the figure is the no-pass one (the lower one).
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const estimateDriverEarning = (ride = {}) => {
  const fare = Math.max(0, Number(ride.fare) || 0);
  const cashback = Math.max(0, Number(ride.cashbackRedemption?.amount) || 0);
  const promo = ride.promo?.code ? Math.max(0, Number(ride.promo?.discount_amount) || 0) : 0;
  const gross = fare + cashback + promo;
  const tolls = Math.min(Math.max(0, Number(ride.tollCharges?.total) || 0), gross);
  const platformFee = Math.min(Math.max(0, Number(ride.pricingSnapshot?.rider_platform_fee) || 0), gross - tolls);
  const snapshot = ride.pricingSnapshot || {};
  const isPercentage = Number(snapshot.admin_commission_type_from_driver ?? 1) === 1;
  const value = Math.max(0, Number(snapshot.admin_commission_from_driver) || 0);
  const base = Math.max(0, gross - tolls - platformFee);
  const commission = isPercentage
    ? Math.min(Math.round(base * value) / 100, base)
    : Math.min(value, base);

  return {
    // The trip's full price before ZI CAB's discounts; the driver is paid on it.
    fareBeforeDiscounts: round2(gross),
    estimatedCommission: round2(commission + platformFee),
    estimatedDriverEarning: round2(Math.max(0, gross - commission - platformFee)),
  };
};
