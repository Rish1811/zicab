import { createOwnerBusWalletTopUp, verifyOwnerBusWalletTopUp } from '../services/registrationService';

/**
 * Razorpay checkout for the bus vendor panel: wallet top-ups and paying for
 * held seats. Resolves with Razorpay's response on success; rejects with
 * { dismissed: true } when the vendor closes the window.
 */

let loading = null;

const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (!loading) {
    loading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        loading = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }
  return loading;
};

export const openRazorpay = async ({ keyId, orderId, amount, currency = 'INR', description, prefill = {} }) => {
  if (!(await loadRazorpay())) throw new Error('Could not open the payment window. Check the internet and try again.');
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount,
      currency,
      name: 'ZI Bus',
      description,
      prefill,
      theme: { color: '#f59e0b' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment window closed'), { dismissed: true })) },
    });
    checkout.on('payment.failed', (response) =>
      reject(new Error(response?.error?.description || 'Payment failed')));
    checkout.open();
  });
};

export const TXN_LABEL = {
  top_up: 'Wallet top-up',
  booking_charge: 'Seats booked',
  booking_refund: 'Cancelled seats',
  admin_credit: 'Added by ZI CAB',
  admin_debit: 'Taken by ZI CAB',
};

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

/// Adds money to the vendor's wallet through Razorpay. Returns the new wallet
/// or throws; a closed window throws { dismissed: true }.
export const topUpVendorWallet = async (amount) => {
  const order = unwrap(await createOwnerBusWalletTopUp(amount));
  const paid = await openRazorpay({
    keyId: order.keyId,
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    description: 'Bus wallet top-up',
  });
  return unwrap(await verifyOwnerBusWalletTopUp(paid));
};

