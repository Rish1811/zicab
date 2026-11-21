import { UserWallet } from '../../user/models/UserWallet.js';

/*
 * Spending ride cashback as a discount on the next ride.
 *
 * Cashback is earned into the rider's wallet (`balance`, ring-fenced by
 * `cashbackBalance`) when a ride completes. Paying a ride from the wallet
 * needed the whole fare there, so a few rupees of cashback could never be
 * used. Instead, a new standard ride takes whatever cashback the rider has off
 * its fare at booking - the rider and driver both see the lower fare - and the
 * cashback is only taken from the wallet when that ride completes, so a
 * cancelled ride costs the rider nothing.
 *
 * ZI CAB pays for the discount: settlement works out commission and the
 * driver's earnings on the fare before cashback (see walletService).
 */

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// The rider always pays at least this much, so no ride is ever free and the
// zero-fare edge cases (no payable amount, zero commission) never arise.
export const MIN_PAYABLE_AFTER_CASHBACK = 1;

/// Cashback the rider can spend right now. `cashbackBalance` can drift above
/// `balance` (the wallet can be debited elsewhere), so it is clamped.
export const getSpendableCashback = (wallet) =>
  roundMoney(Math.max(0, Math.min(Number(wallet?.cashbackBalance) || 0, Number(wallet?.balance) || 0)));

/// The `cashbackRedemption` to put on a new ride, or null when none applies.
/// Only a fixed-fare ride qualifies: a promo or a subscription already
/// discounts it, and a bidding ride's fare is not settled at booking.
export const resolveCashbackForBooking = async ({
  userId,
  fare,
  useCashback = true,
  pricingNegotiationMode = 'none',
  hasPromo = false,
  isSubscriptionCovered = false,
}) => {
  if (!useCashback || hasPromo || isSubscriptionCovered || pricingNegotiationMode !== 'none') {
    return null;
  }

  const fareBefore = roundMoney(fare);
  if (fareBefore <= MIN_PAYABLE_AFTER_CASHBACK) {
    return null;
  }

  const wallet = await UserWallet.findOne({ userId }).select('balance cashbackBalance').lean();
  const available = getSpendableCashback(wallet);
  const amount = roundMoney(Math.min(available, fareBefore - MIN_PAYABLE_AFTER_CASHBACK));
  if (amount <= 0) {
    return null;
  }

  return {
    amount,
    fareBeforeCashback: fareBefore,
    appliedAt: new Date(),
    consumedAt: null,
  };
};

/// Takes the cashback a completed ride used out of the rider's wallet. Runs
/// once per ride (keyed on the ride), and never fails the completion: if the
/// rider somehow has less cashback left than the ride used, they are not
/// charged the difference - ZI CAB already honoured the discount.
export const consumeRideCashbackRedemption = async (ride) => {
  const amount = roundMoney(ride?.cashbackRedemption?.amount);
  if (!ride?._id || !ride?.userId || amount <= 0) {
    return 'skipped';
  }

  const referenceKey = `ride-cashback-used:${String(ride._id)}`;
  const already = await UserWallet.exists({ userId: ride.userId, 'transactions.referenceKey': referenceKey });
  if (already) {
    return 'existing';
  }

  const wallet = await UserWallet.findOne({ userId: ride.userId }).select('balance cashbackBalance').lean();
  const taken = roundMoney(Math.min(amount, getSpendableCashback(wallet)));
  if (taken <= 0) {
    return 'nothing_left';
  }

  const result = await UserWallet.updateOne(
    {
      userId: ride.userId,
      'transactions.referenceKey': { $ne: referenceKey },
      balance: { $gte: taken },
    },
    {
      $inc: { balance: -taken, cashbackBalance: -taken },
      $push: {
        transactions: {
          $each: [{
            kind: 'debit',
            amount: taken,
            title: `Cashback used on ride ${String(ride._id).slice(-6)}`,
            provider: 'ride_cashback_redeemed',
            referenceKey,
          }],
          $slice: -50,
        },
      },
    },
  );

  // Never let the ring-fence go negative after the decrement.
  await UserWallet.updateOne(
    { userId: ride.userId, cashbackBalance: { $lt: 0 } },
    { $set: { cashbackBalance: 0 } },
  );

  return result.modifiedCount ? 'consumed' : 'existing';
};
